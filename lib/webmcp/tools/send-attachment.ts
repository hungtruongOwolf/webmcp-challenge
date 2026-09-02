import type { ToolFactory } from "@/lib/webmcp/types";
import { textResult, errorResult } from "@/lib/webmcp/budget";
import { conversationTitle, loadConversationHead } from "@/lib/webmcp/conversations";
import {
  describeUploadError,
  uploadChatFile,
  uploadChatImage,
} from "@/app/libs/supabase/upload";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

/** Turns a data: URL into a File the app's upload helper can validate and store. */
function fileFromDataUrl(dataUrl: string, name?: string): File | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return null;

  const mime = (match[1] || "application/octet-stream").toLowerCase();
  const payload = match[3];
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    if (match[2]) {
      const decoded = atob(payload);
      bytes = new Uint8Array(new ArrayBuffer(decoded.length));
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
  } catch {
    return null;
  }

  const fileName = name || `attachment.${MIME_EXTENSIONS[mime] || "bin"}`;
  return new File([bytes], fileName, { type: mime });
}

const readDetail = async (res: { text?: () => Promise<string> }) =>
  (await res.text?.().catch(() => "")) || "";

export const sendAttachment: ToolFactory = (ctx) => ({
  name: "send_attachment",
  description:
    "Send an image or file into a conversation, from exactly one source: data_url (a base64 " +
    "data: URL of the bytes), url (a public http/https link, fetched server side), or " +
    "message_id (re-send the attachment already on a message in any of your conversations). " +
    "Add caption to send text with it. Images: jpeg/png/webp/gif up to 4 MB. Files: pdf, " +
    "office documents, txt, csv, zip up to 20 MB. To pass along text too, use forward_message.",
  inputSchema: {
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Target conversation id, from list_conversations.",
      },
      data_url: {
        type: "string",
        description: "The attachment as a data: URL (e.g. data:image/png;base64,...).",
      },
      url: {
        type: "string",
        description: "A public http(s) URL to fetch and attach.",
      },
      message_id: {
        type: "string",
        description: "Id of a message (from read_conversation) whose attachment should be re-sent.",
      },
      caption: {
        type: "string",
        description: "Optional text to send along with the attachment.",
      },
      file_name: {
        type: "string",
        description: "Optional file name for a data_url upload, e.g. report.pdf.",
      },
    },
    required: ["conversation_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const conversationId = String(input.conversation_id || "");
    const dataUrl = String(input.data_url || "");
    const url = String(input.url || "").trim();
    const messageId = String(input.message_id || "");
    const caption = String(input.caption || "").trim() || undefined;

    if (!conversationId) return errorResult("conversation_id is required.");
    const sources = [dataUrl, url, messageId].filter(Boolean).length;
    if (sources !== 1) {
      return errorResult("Pass exactly one source: data_url, url, or message_id.");
    }

    let kind = "attachment";

    if (dataUrl) {
      const file = fileFromDataUrl(dataUrl, input.file_name ? String(input.file_name) : undefined);
      if (!file) return errorResult("data_url is not a valid data: URL.");

      // The upload helper owns type/size validation and phrases the refusal;
      // this only picks which bucket to try.
      const isImage = file.type.startsWith("image/");

      let uploaded: Awaited<ReturnType<typeof uploadChatImage>>;
      try {
        uploaded = isImage
          ? await uploadChatImage(ctx.supabase, conversationId, file)
          : await uploadChatFile(ctx.supabase, conversationId, file);
      } catch (err) {
        return errorResult(describeUploadError(err));
      }

      const payload = isImage
        ? { conversationId, message: caption, image: uploaded.url }
        : {
            conversationId,
            message: caption,
            fileUrl: uploaded.url,
            fileName: file.name,
            fileSize: file.size,
          };
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await uploaded.remove().catch(() => {});
        return errorResult(`Uploaded, but could not send the message (status ${res.status}).`);
      }
      kind = isImage ? "image" : "file";
    } else {
      const res = await fetch("/api/messages/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          url ? { conversationId, caption, url } : { conversationId, caption, sourceMessageId: messageId }
        ),
      });
      if (!res.ok) {
        const detail = await readDetail(res);
        return errorResult(`Could not send the attachment (status ${res.status}). ${detail}`.trim());
      }
      const result = await res.json().catch(() => ({}));
      if (result?.kind) kind = String(result.kind);
    }

    const conversation = await loadConversationHead(ctx.supabase, conversationId).catch(() => null);
    const title = conversationTitle(conversation, ctx.currentUser.id);
    const withCaption = caption ? ` with caption "${caption}"` : "";
    return textResult(`Sent the ${kind} to ${title}${withCaption}.`);
  },
});

import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import { safeFetch } from "@/app/libs/safe-fetch";
import {
  AttachmentError,
  assertWithinLimit,
  copyMessageAttachment,
  createMessageArgs,
  readBodyWithinLimit,
  requireAttachmentTarget,
  storeFetchedAttachment,
} from "@/app/libs/supabase/attachments";
import type { StoredAttachment } from "@/app/libs/supabase/attachments";

export const runtime = "nodejs";

const nameFromUrl = (url: string): string => {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
};

/**
 * Sends an attachment into a conversation from a source the browser cannot
 * upload itself: a remote URL (fetched here, SSRF-guarded, so the agent
 * never needs a file picker) or an attachment already on a message the
 * caller can read (copied inside storage, never re-downloaded). Membership
 * of the target is checked up front; the source is gated by RLS on the
 * messages row and the storage object.
 */
export async function POST(req: Request) {
  let stored: StoredAttachment | null = null;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const sourceMessageId = typeof body.sourceMessageId === "string" ? body.sourceMessageId : "";
    const caption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;

    if (!conversationId) return new NextResponse("conversationId is required.", { status: 400 });
    if ((url ? 1 : 0) + (sourceMessageId ? 1 : 0) !== 1) {
      return new NextResponse("Pass exactly one of url or sourceMessageId.", { status: 400 });
    }

    const { data: isMember, error: memberError } = await supabase.rpc("is_conversation_member", {
      conv_id: conversationId,
    });
    if (memberError) throw memberError;
    if (!isMember) {
      return new NextResponse("You are not a member of that conversation.", { status: 403 });
    }

    if (url) {
      const res = await safeFetch(url);
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return new NextResponse(`Could not fetch that URL (status ${res.status}).`, { status: 502 });
      }

      // Type and declared size are checked before a single body byte is read.
      const contentType = res.headers.get("content-type") || "";
      const { kind } = requireAttachmentTarget(contentType);
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > 0) assertWithinLimit(kind, declared);

      stored = await storeFetchedAttachment(supabase, {
        bytes: await readBodyWithinLimit(res.body, kind),
        contentType,
        name: nameFromUrl(url),
        conversationId,
        userId: user.id,
      });
    } else {
      const { data: source, error: sourceError } = await supabase
        .from("messages")
        .select("id, body, image, file_url, file_name, file_size")
        .eq("id", sourceMessageId)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (!source) {
        return new NextResponse("No message with that id that you can read.", { status: 404 });
      }

      stored = await copyMessageAttachment(supabase, source, conversationId, user.id);
      if (!stored) return new NextResponse("That message has no attachment.", { status: 400 });
    }

    const { data: messageId, error: rpcError } = await supabase.rpc(
      "create_message",
      createMessageArgs(conversationId, caption, stored)
    );
    if (rpcError) throw rpcError;

    return NextResponse.json({ id: messageId, conversationId, kind: stored.kind });
  } catch (error: unknown) {
    await stored?.remove().catch(() => {});

    if (error instanceof AttachmentError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error("ERROR_MESSAGE_ATTACHMENT:", error);
    const message = error instanceof Error ? error.message : "Could not send that attachment.";
    return new NextResponse(message, { status: 500 });
  }
}

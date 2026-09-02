import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import {
  AttachmentError,
  isOwnStorageOrigin,
  ownAttachmentObject,
} from "@/app/libs/supabase/attachments";

const toProfileDTO = (p: any) =>
  p && {
    id: p.id,
    name: p.name,
    email: p.email,
    image: p.image,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };

const toMessageDTO = (m: any) => ({
  id: m.id,
  body: m.body,
  image: m.image,
  fileUrl: m.file_url,
  fileName: m.file_name,
  fileSize: m.file_size,
  createdAt: m.created_at,
  senderId: m.sender_id,
  conversationId: m.conversation_id,
  sender: toProfileDTO(m.sender),
  seen: (m.seen ?? []).map(toProfileDTO),
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { message, image, conversationId, fileUrl, fileName, fileSize } = await req.json();
    if (typeof conversationId !== "string" || !conversationId) {
      return new NextResponse("conversationId is required.", { status: 400 });
    }

    // The columns may only ever point at this project's own storage, under
    // the folder of the conversation the message is going into.
    for (const [kind, url] of [["image", image], ["file", fileUrl]] as const) {
      if (url == null) continue;
      if (typeof url !== "string" || !isOwnStorageOrigin(url)) {
        return new NextResponse(`${kind} must be one of Verb's own storage URLs.`, { status: 400 });
      }
      ownAttachmentObject(url, kind, conversationId, 400);
    }

    const { data: messageId, error: rpcError } = await supabase.rpc(
      "create_message",
      {
        p_conversation_id: conversationId,
        p_body: message,
        p_image: image,
        p_file_url: fileUrl,
        p_file_name: fileName,
        p_file_size: fileSize,
      },
    );

    if (rpcError) throw rpcError;

    const { data: full, error: fetchError } = await supabase
      .from("messages")
      .select(
        `*, sender:profiles!messages_sender_id_fkey (*), seen:message_seen ( profile:profiles!message_seen_user_id_fkey (*) )`,
      )
      .eq("id", messageId)
      .single();

    if (fetchError) throw fetchError;

    const dto = toMessageDTO({
      ...full,
      seen: (full.seen ?? []).map((s: any) => s.profile),
    });

    return NextResponse.json(dto);
  } catch (error: unknown) {
    if (error instanceof AttachmentError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error("ERROR_MESSAGES:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

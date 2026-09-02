import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import {
  AttachmentError,
  copyMessageAttachment,
  createMessageArgs,
} from "@/app/libs/supabase/attachments";
import type { StoredAttachment } from "@/app/libs/supabase/attachments";

type IParams = {
  messageId?: string;
};

/**
 * Re-sends a message the caller can read into a conversation the caller is
 * in. Text is copied as-is; an attachment is copied inside storage so the
 * forwarded copy survives the source conversation being deleted.
 */
export async function POST(req: Request, { params }: { params: Promise<IParams> }) {
  let stored: StoredAttachment | null = null;

  try {
    const { messageId } = await params;
    if (!messageId) return new NextResponse("Invalid Id.", { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    if (!conversationId) return new NextResponse("conversationId is required.", { status: 400 });

    const { data: isMember, error: memberError } = await supabase.rpc("is_conversation_member", {
      conv_id: conversationId,
    });
    if (memberError) throw memberError;
    if (!isMember) {
      return new NextResponse("You are not a member of the target conversation.", { status: 403 });
    }

    const { data: source, error: sourceError } = await supabase
      .from("messages")
      .select("id, body, image, file_url, file_name, file_size")
      .eq("id", messageId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return new NextResponse("No message with that id that you can read.", { status: 404 });

    stored = await copyMessageAttachment(supabase, source, conversationId, user.id);
    if (!stored && !source.body) {
      return new NextResponse("That message has nothing to forward.", { status: 400 });
    }

    const { data: newMessageId, error: rpcError } = await supabase.rpc(
      "create_message",
      createMessageArgs(conversationId, source.body, stored)
    );
    if (rpcError) throw rpcError;

    return NextResponse.json({ id: newMessageId, conversationId });
  } catch (error: unknown) {
    await stored?.remove().catch(() => {});

    if (error instanceof AttachmentError) {
      return new NextResponse(error.message, { status: error.status });
    }
    console.error("ERROR_MESSAGE_FORWARD:", error);
    const message = error instanceof Error ? error.message : "Could not forward that message.";
    return new NextResponse(message, { status: 500 });
  }
}

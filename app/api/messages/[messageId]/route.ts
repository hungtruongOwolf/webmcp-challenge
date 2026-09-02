import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import { storageObjectFromUrl } from "@/app/libs/supabase/attachments";

type IParams = {
  messageId?: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The update itself is already fenced by RLS (authors only) and column
 * privileges, but a bare 0-row update cannot say WHY nothing changed. This
 * lookup turns "missing", "not yours", and "already gone" into distinct
 * answers an agent can relay to the user.
 */
async function loadOwnMessage(supabase: SupabaseServerClient, messageId: string, userId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, deleted_at, image, file_url")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return { refusal: new NextResponse("No message with that id that you can read.", { status: 404 }) };
  }
  if (data.sender_id !== userId) {
    return { refusal: new NextResponse("Only the author can edit or delete this message.", { status: 403 }) };
  }
  if (data.deleted_at) {
    return { refusal: new NextResponse("That message was already deleted.", { status: 409 }) };
  }
  return { message: data };
}

export async function PATCH(req: Request, { params }: { params: Promise<IParams> }) {
  try {
    const { messageId } = await params;
    if (!messageId) return new NextResponse("Invalid Id.", { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) return new NextResponse("body is required.", { status: 400 });

    const { refusal } = await loadOwnMessage(supabase, messageId, user.id);
    if (refusal) return refusal;

    const editedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("messages")
      .update({ body, edited_at: editedAt })
      .eq("id", messageId)
      .eq("sender_id", user.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return new NextResponse("The message changed before the edit could be saved.", { status: 409 });

    return NextResponse.json({ id: messageId, body, editedAt });
  } catch (error: unknown) {
    console.error("ERROR_MESSAGE_EDIT:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<IParams> }) {
  try {
    const { messageId } = await params;
    if (!messageId) return new NextResponse("Invalid Id.", { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { refusal, message } = await loadOwnMessage(supabase, messageId, user.id);
    if (refusal) return refusal;

    const { data, error } = await supabase
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
        body: null,
        image: null,
        file_url: null,
        file_name: null,
        file_size: null,
      })
      .eq("id", messageId)
      .eq("sender_id", user.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return new NextResponse("That message was already deleted.", { status: 409 });

    // Best effort: the row no longer points at the object, so a failed
    // removal only leaves an orphan behind, not a broken message.
    const object = storageObjectFromUrl(message.image ?? message.file_url ?? "");
    if (object) {
      try {
        await supabase.storage.from(object.bucket).remove([object.path]);
      } catch (removeError) {
        console.error("ERROR_MESSAGE_DELETE_STORAGE:", removeError);
      }
    }

    return NextResponse.json({ id: messageId, deleted: true });
  } catch (error: unknown) {
    console.error("ERROR_MESSAGE_DELETE:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

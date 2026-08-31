import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

type IParams = {
  conversationId: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<IParams> },
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { data: messages } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);

    if (!messages || messages.length === 0) return NextResponse.json({ ok: true });

    const { data: seenRows } = await supabase
      .from("message_seen")
      .select("message_id")
      .eq("user_id", user.id)
      .in("message_id", messages.map((m) => m.id));

    const seenIds = new Set((seenRows ?? []).map((r) => r.message_id));
    const unseenIds = messages.map((m) => m.id).filter((id) => !seenIds.has(id));

    if (unseenIds.length === 0) return NextResponse.json({ ok: true });

    // Idempotent: marking an already-seen message seen again is a no-op,
    // not an error, and the DB trigger only broadcasts on the first insert.
    const { error } = await supabase
      .from("message_seen")
      .upsert(
        unseenIds.map((id) => ({ message_id: id, user_id: user.id })),
        { onConflict: "message_id,user_id", ignoreDuplicates: true }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("ERROR_MESSAGES_SEEN:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

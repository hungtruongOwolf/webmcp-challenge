import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

const toProfileDTO = (p: any) =>
  p && {
    id: p.id,
    name: p.name,
    email: p.email,
    image: p.image,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { userId, isGroup, members, name } = await request.json();

    if (isGroup && (!members || members.length < 2 || !name))
      return new NextResponse("Invalid data.", { status: 400 });

    const memberIds = isGroup
      ? members.map((m: { value: string }) => m.value)
      : [userId];

    const { data: conversationId, error: rpcError } = await supabase.rpc(
      "create_conversation",
      {
        p_member_ids: memberIds,
        p_is_group: !!isGroup,
        p_name: isGroup ? name : null,
      }
    );

    if (rpcError) throw rpcError;

    const { data, error } = await supabase
      .from("conversations")
      .select(
        `id, name, is_group, created_at, last_message_at,
         members:conversation_members ( profile:profiles (*) )`
      )
      .eq("id", conversationId)
      .single();

    if (error) throw error;

    const dto = {
      id: data.id,
      name: data.name,
      isGroup: data.is_group,
      createdAt: data.created_at,
      lastMessageAt: data.last_message_at,
      users: (data.members ?? []).map((m: any) => toProfileDTO(m.profile)),
    };

    return NextResponse.json(dto);
  } catch (error: unknown) {
    console.error("ERROR_CONVERSATIONS:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

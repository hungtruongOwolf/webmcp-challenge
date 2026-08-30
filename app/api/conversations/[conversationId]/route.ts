import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

type IParams = {
  conversationId?: string;
};

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<IParams> },
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    // RLS scopes this delete to conversations the caller is a member of --
    // a non-member's request affects zero rows instead of erroring.
    const { data, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) return new NextResponse("Invalid Id.", { status: 400 });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("ERROR_CONVERSATION_DELETE:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

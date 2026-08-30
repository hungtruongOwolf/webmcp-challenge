import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { name, image } = await req.json();

    const { data, error } = await supabase
      .from("profiles")
      .update({ name, image })
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("ERROR_SETTINGS:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

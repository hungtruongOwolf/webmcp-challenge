import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

type IParams = {
  conversationId?: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DELETE_BUCKETS = ["chat-images", "chat-files"] as const;

/**
 * Storage's list() only returns immediate children of a prefix -- files live
 * two levels under the conversation folder (<conversationId>/<uploaderId>/<file>),
 * so folders (entries with no id) need one more list() call each.
 */
async function collectAllPaths(
  supabase: SupabaseServerClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const paths: string[] = [];
  for (const entry of data) {
    const fullPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      paths.push(...(await collectAllPaths(supabase, bucket, fullPath)));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

/**
 * "Delete chat" only removes the caller's own membership -- for a group
 * that just means leaving, everyone else keeps the conversation untouched.
 * Storage/messages are only destroyed when leave_conversation() reports the
 * caller was the LAST member, since at that point nobody else can see the
 * conversation anyway. That destruction is the same three-step, user-scoped
 * operation as before (see 20260830120700_conversation_image_cleanup.sql):
 * leave_conversation() marks it as deleting, this route removes every
 * Storage object with the caller's own authenticated client, then
 * finish_conversation_deletion() re-checks both buckets are empty before
 * dropping the row. No service-role credential is needed anywhere.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<IParams> },
) {
  try {
    const { conversationId } = await params;
    if (!conversationId) return new NextResponse("Invalid Id.", { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { data: wasLastMember, error: leaveError } = await supabase.rpc("leave_conversation", {
      p_conversation_id: conversationId,
    });
    if (leaveError) return new NextResponse(leaveError.message, { status: 400 });

    if (!wasLastMember) {
      return NextResponse.json({ id: conversationId, fullyDeleted: false });
    }

    for (const bucket of DELETE_BUCKETS) {
      const paths = await collectAllPaths(supabase, bucket, conversationId);
      if (paths.length === 0) continue;

      const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
      if (removeError) throw removeError;
    }

    const { error: finishError } = await supabase.rpc("finish_conversation_deletion", {
      p_conversation_id: conversationId,
    });
    if (finishError) return new NextResponse(finishError.message, { status: 400 });

    return NextResponse.json({ id: conversationId, fullyDeleted: true });
  } catch (error: unknown) {
    console.error("ERROR_CONVERSATION_DELETE:", error);
    return new NextResponse("Internal Server Error.", { status: 500 });
  }
}

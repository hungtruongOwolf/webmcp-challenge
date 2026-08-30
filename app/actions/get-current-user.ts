import { createClient } from "@/app/libs/supabase/server";

/**
 * The signed-in user's profile row, or null.
 *
 * Reads through the user's own cookie, so RLS applies. The returned shape
 * mirrors the old Prisma User closely enough that avatars, the sidebar and
 * the settings modal did not need rewriting.
 */
const getCurrentUser = async () => {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    return profile ?? null;
  } catch {
    return null;
  }
};

export default getCurrentUser;

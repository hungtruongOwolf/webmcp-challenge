import { createClient } from "@/app/libs/supabase/server";

/** Everyone except you. The "People" page. */
const getUsers = async () => {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", user.id)
      .order("created_at", { ascending: false });

    return data ?? [];
  } catch {
    return [];
  }
};

export default getUsers;

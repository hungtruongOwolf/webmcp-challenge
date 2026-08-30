import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

/**
 * Exchanges an OAuth / email-link code for a session cookie.
 * Unused while email+password is the only bootstrap path, but this is the
 * redirect target the moment a provider is enabled in the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/users";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}

import { NextResponse } from "next/server";
import {
  buildPasskeyEnrollmentPath,
  sanitizeAuthReturnPath,
} from "@/app/libs/auth/return-path";
import { FOCUS_AFTER_AUTH_COOKIE_NAME } from "@/app/libs/auth/focus-after-auth";
import { createClient } from "@/app/libs/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnPath = sanitizeAuthReturnPath(url.searchParams.get("next"));
  const enrollPasskey = url.searchParams.get("enroll") === "passkey";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = enrollPasskey
        ? buildPasskeyEnrollmentPath(returnPath)
        : returnPath;
      const response = NextResponse.redirect(new URL(destination, url.origin));
      response.cookies.set(FOCUS_AFTER_AUTH_COOKIE_NAME, "1", {
        path: "/",
        maxAge: 60,
        sameSite: "lax",
        secure: url.protocol === "https:",
      });
      return response;
    }
  }

  const failure = new URL("/", url.origin);
  failure.searchParams.set("error", "auth_link_invalid");
  failure.searchParams.set("next", returnPath);
  return NextResponse.redirect(failure);
}

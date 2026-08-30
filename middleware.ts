import type { NextRequest } from "next/server";

import { updateSession } from "@/app/libs/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Runs broadly so the auth cookie is refreshed on every navigation, not
  // just on protected routes. The route guard itself lives in updateSession.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

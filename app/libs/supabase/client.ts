import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/app/types/database";

/**
 * Browser-side Supabase client.
 *
 * The `experimental.passkey` opt-in is required for registerPasskey() and
 * signInWithPasskey() to exist on the auth object at all. Passkeys are beta,
 * which is why @supabase/supabase-js is pinned to an exact version in
 * package.json rather than carrying a caret.
 */
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        experimental: { passkey: true },
      },
    }
  );

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/app/libs/supabase/client";

const CurrentUserContext = createContext<User | null>(null);

type Props = PropsWithChildren<{ initialUser: User | null }>;

/**
 * Replaces next-auth's <SessionProvider>. Seeded from the server so the
 * first paint already knows who is signed in, then kept live by Supabase's
 * auth state listener (sign-in, sign-out, token refresh).
 */
export const CurrentUserProvider = ({ initialUser, children }: Props) => {
  const [user, setUser] = useState<User | null>(initialUser);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
};

/** Replaces useSession(). Returns the signed-in user, or null. */
export const useCurrentUser = () => useContext(CurrentUserContext);

import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";
import { Inter } from "next/font/google";

import ActiveStatus from "@/app/components/active-status";
import ToasterContext from "@/app/context/toaster-context";
import { CurrentUserProvider } from "@/app/context/current-user-context";
import { createClient } from "@/app/libs/supabase/server";
import { siteConfig } from "@/app/config/site";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#0284C7",
};

export const metadata: Metadata = siteConfig;

export default async function RootLayout({ children }: PropsWithChildren) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className={inter.className}>
        <CurrentUserProvider initialUser={user}>
          {/* react hot toast */}
          <aside>
            <ToasterContext />
          </aside>

          <ActiveStatus />
          {children}
        </CurrentUserProvider>
      </body>
    </html>
  );
}

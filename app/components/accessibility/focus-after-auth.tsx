"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { consumeFocusAfterAuth } from "@/app/libs/auth/focus-after-auth";

type FocusAfterAuthProps = {
  pathname: string;
};

export const FocusAfterAuth = ({ pathname }: FocusAfterAuthProps) => {
  useEffect(() => {
    if (!consumeFocusAfterAuth()) return;
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        "[data-page-title], #main-content"
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
};

export const RouteFocusAfterAuth = () => (
  <FocusAfterAuth pathname={usePathname()} />
);

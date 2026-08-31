"use client";

import { createContext, useContext, type PropsWithChildren } from "react";

type OverlayApi = {
  openProfile: () => void;
  openDirectory: () => void;
  openNewGroup: () => void;
};

const OverlayContext = createContext<OverlayApi | null>(null);

export function OverlayProvider({
  value,
  children,
}: PropsWithChildren<{ value: OverlayApi }>) {
  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

export function useOverlay() {
  const ctx = useContext(OverlayContext);

  if (!ctx) throw new Error("useOverlay must be used within OverlayProvider");

  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

type Theme = "light" | "dark";
type Density = "compact" | "comfortable" | "roomy";

type UiSettings = {
  theme: Theme;
  glass: boolean;
  density: Density;
  toggleTheme: () => void;
  toggleGlass: () => void;
  setDensity: (density: Density) => void;
};

const STORAGE_KEY = "gm-ui-settings";

const UiSettingsContext = createContext<UiSettings | null>(null);

function readStored(): { theme: Theme; glass: boolean; density: Density } {
  if (typeof window === "undefined")
    return { theme: "light", glass: true, density: "comfortable" };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { theme: "light", glass: true, density: "comfortable" };

    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme === "dark" ? "dark" : "light",
      glass: parsed.glass !== false,
      density: ["compact", "comfortable", "roomy"].includes(parsed.density)
        ? parsed.density
        : "comfortable",
    };
  } catch {
    return { theme: "light", glass: true, density: "comfortable" };
  }
}

export function UiSettingsProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>("light");
  const [glass, setGlass] = useState(true);
  const [density, setDensityState] = useState<Density>("comfortable");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setTheme(stored.theme);
    setGlass(stored.glass);
    setDensityState(stored.density);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ theme, glass, density })
      );
    } catch {
      // ignore write failures (private browsing, storage full, etc.)
    }
  }, [theme, glass, density, hydrated]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const toggleGlass = useCallback(() => {
    setGlass((g) => !g);
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
  }, []);

  return (
    <UiSettingsContext.Provider
      value={{ theme, glass, density, toggleTheme, toggleGlass, setDensity }}
    >
      {children}
    </UiSettingsContext.Provider>
  );
}

export function useUiSettings() {
  const ctx = useContext(UiSettingsContext);

  if (!ctx)
    throw new Error("useUiSettings must be used within UiSettingsProvider");

  return ctx;
}

"use client";

import { Be_Vietnam_Pro } from "next/font/google";
import Image from "next/image";
import type { PropsWithChildren } from "react";
import { HiMoon, HiSun } from "react-icons/hi2";

import { UiSettingsProvider, useUiSettings } from "@/app/context/ui-settings-context";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

function ShellInner({ children }: PropsWithChildren) {
  const { theme, glass, toggleTheme } = useUiSettings();

  return (
    <div
      className={`gm ${beVietnamPro.className}`}
      data-theme={theme}
      data-glass={glass ? "on" : "off"}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div aria-hidden className="gm-bg" />

      <button
        type="button"
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={toggleTheme}
        className="gm-icon-btn"
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: 2,
          width: 40,
          height: 40,
          boxShadow: "inset 0 0 0 0.5px var(--hair)",
        }}
      >
        {theme === "dark" ? <HiSun size={18} /> : <HiMoon size={18} />}
      </button>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          padding: "24px 0",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Image
            src="/images/logo.png"
            alt=""
            height={44}
            width={44}
            style={{ borderRadius: 12, boxShadow: "var(--e1)" }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "var(--t1)",
              textAlign: "center",
            }}
          >
            Continue with your account
          </h1>
        </div>

        {children}
      </div>
    </div>
  );
}

const AuthShell: React.FC<PropsWithChildren> = ({ children }) => (
  <UiSettingsProvider>
    <ShellInner>{children}</ShellInner>
  </UiSettingsProvider>
);

export default AuthShell;

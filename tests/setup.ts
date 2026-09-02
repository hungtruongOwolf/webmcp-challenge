import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// next/font/google reaches out to Google Fonts at build time, which has no
// meaning under jsdom -- any component tree that imports it (auth-shell,
// conversations-shell) needs a stand-in returning the shape callers read.
vi.mock("next/font/google", () => ({
  Be_Vietnam_Pro: () => ({ className: "font-mock" }),
}));

afterEach(() => cleanup());

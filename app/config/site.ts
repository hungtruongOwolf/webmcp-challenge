import { Metadata } from "next";

export const siteConfig: Metadata = {
  title: "Verb",
  description:
    "Nouns need eyes. Verbs need a voice. A real-time messenger where every action is also a WebMCP tool, so a blind or low-vision user can fully operate it by talking to an AI agent.",
  keywords: [
    "webmcp",
    "model-context-protocol",
    "accessibility",
    "screen reader",
    "voice agent",
    "nextjs",
    "react",
    "typescript",
    "supabase",
    "realtime",
    "chat app",
    "passkeys",
    "webauthn",
  ] as Array<string>,
  authors: {
    name: "hungtruongOwolf",
    url: "https://github.com/hungtruongOwolf/webmcp-challenge",
  },
} as const;

import { Metadata } from "next";

export const siteConfig: Metadata = {
  title: "Messenger Clone",
  description:
    "A WebMCP-native real-time Messenger clone -- an AI agent can drive the chat UI on the signed-in user's behalf.",
  keywords: [
    "webmcp",
    "model-context-protocol",
    "nextjs",
    "react",
    "typescript",
    "supabase",
    "realtime",
    "chat app",
    "passkeys",
    "webauthn",
    "accessibility",
  ] as Array<string>,
  authors: {
    name: "hungtruongOwolf",
    url: "https://github.com/hungtruongOwolf/webmcp-challenge",
  },
} as const;

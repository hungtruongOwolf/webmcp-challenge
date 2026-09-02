import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import { generateWithGemini } from "@/app/libs/gemini";
import { generateWithClaude } from "@/app/libs/anthropic";
import { fetchAsBase64 } from "@/app/libs/fetch-base64";
import { safeFetch } from "@/app/libs/safe-fetch";

const PDF_PROMPT =
  "Extract and summarize the key content of this document in plain language. Preserve important facts, names, and numbers.";

const TEXT_EXTENSIONS = new Set(["txt", "csv"]);
const MAX_TEXT_CHARS = 20000;

const extensionOf = (name: string) =>
  name.split("?")[0].split(".").pop()?.toLowerCase() || "";

/**
 * Reads the content of a file attached to a message, for the read_file
 * WebMCP tool. Plain text/CSV is fetched and returned as-is; PDFs go
 * through Claude (or Gemini as a fallback), the same providers
 * /api/describe leans on for images. Office formats (doc/xls/ppt) and
 * archives aren't parsed -- say so plainly rather than pretend to read them.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { fileUrl, fileName } = await req.json();
    if (!fileUrl || typeof fileUrl !== "string") {
      return new NextResponse("fileUrl is required.", { status: 400 });
    }

    const ext = extensionOf(fileName || fileUrl);

    if (TEXT_EXTENSIONS.has(ext)) {
      const res = await safeFetch(fileUrl);
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return new NextResponse(`Could not fetch the file (status ${res.status}).`, { status: 502 });
      }

      const text = await res.text();
      return NextResponse.json({ text: text.slice(0, MAX_TEXT_CHARS) });
    }

    if (ext === "pdf") {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const geminiKey = process.env.GEMINI_API_KEY;

      if (!anthropicKey && !geminiKey) {
        return new NextResponse(
          "Reading PDFs isn't configured yet (set ANTHROPIC_API_KEY or GEMINI_API_KEY -- free at aistudio.google.com/apikey).",
          { status: 501 }
        );
      }

      const { data: bytes } = await fetchAsBase64(fileUrl);
      const text = anthropicKey
        ? await generateWithClaude(
            [
              { type: "text", text: PDF_PROMPT },
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes } },
            ],
            anthropicKey
          )
        : await generateWithGemini(
            [{ text: PDF_PROMPT }, { inline_data: { mime_type: "application/pdf", data: bytes } }],
            geminiKey!
          );

      return NextResponse.json({ text: text || "No content extracted." });
    }

    return new NextResponse(
      `Can't read .${ext || "this"} files yet -- only .txt, .csv, and .pdf are supported.`,
      { status: 415 }
    );
  } catch (error: unknown) {
    console.error("ERROR_READ_FILE:", error);
    const message = error instanceof Error ? error.message : "Could not read that file.";
    return new NextResponse(message, { status: 502 });
  }
}

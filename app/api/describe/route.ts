import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import { generateWithGemini } from "@/app/libs/gemini";
import { generateWithClaude } from "@/app/libs/anthropic";
import { fetchAsBase64 } from "@/app/libs/fetch-base64";

const PROMPT =
  "Describe this image in one or two plain sentences for someone who can't see it. Be concrete and factual.";

const describeWithClaude = async (imageUrl: string, apiKey: string) => {
  const { data: bytes, contentType } = await fetchAsBase64(imageUrl);

  return generateWithClaude(
    [
      { type: "text", text: PROMPT },
      { type: "image", source: { type: "base64", media_type: contentType || "image/jpeg", data: bytes } },
    ],
    apiKey
  );
};

const describeWithGemini = async (imageUrl: string, apiKey: string) => {
  const { data: bytes, contentType } = await fetchAsBase64(imageUrl);

  return generateWithGemini(
    [{ text: PROMPT }, { inline_data: { mime_type: contentType || "image/jpeg", data: bytes } }],
    apiKey
  );
};

const describeWithOpenAI = async (imageUrl: string, apiKey: string) => {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error("OpenAI didn't respond in time.");
    }
    throw err;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (status ${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim();
};

/**
 * Describes an image message for the describe_image WebMCP tool -- the
 * accessibility feature the whole pitch is built around, so a blind or
 * low-vision user can ask "what's in this photo?" and get an answer.
 *
 * The vision API key has to stay server-side, which is the one reason this
 * route exists instead of calling a provider straight from the tool.
 * Claude is tried first (best reliability/quality here), Gemini next (free
 * tier, no cost), and OpenAI last as a fallback for whoever already has
 * that key set.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { imageUrl } = await req.json();
    if (!imageUrl || typeof imageUrl !== "string") {
      return new NextResponse("imageUrl is required.", { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey && !geminiKey && !openaiKey) {
      return new NextResponse(
        "Image description isn't configured yet (set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY).",
        { status: 501 }
      );
    }

    const description = anthropicKey
      ? await describeWithClaude(imageUrl, anthropicKey)
      : geminiKey
        ? await describeWithGemini(imageUrl, geminiKey)
        : await describeWithOpenAI(imageUrl, openaiKey!);

    return NextResponse.json({ description: description || "No description available." });
  } catch (error: unknown) {
    console.error("ERROR_DESCRIBE:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error.";
    return new NextResponse(message, { status: 502 });
  }
}

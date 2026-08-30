import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";

const PROMPT =
  "Describe this image in one or two plain sentences for someone who can't see it. Be concrete and factual.";

const describeWithGemini = async (imageUrl: string, apiKey: string) => {
  const image = await fetch(imageUrl);
  if (!image.ok) throw new Error(`Could not fetch the image itself (status ${image.status}).`);

  const contentType = image.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await image.arrayBuffer()).toString("base64");

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: contentType, data: bytes } },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (status ${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
};

const describeWithOpenAI = async (imageUrl: string, apiKey: string) => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
  });

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
 * Gemini is tried first -- its free tier includes vision at no cost, unlike
 * OpenAI's -- and OpenAI is a fallback for whoever already has that key set.
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

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      return new NextResponse(
        "Image description isn't configured yet (set GEMINI_API_KEY -- free at aistudio.google.com -- or OPENAI_API_KEY).",
        { status: 501 }
      );
    }

    const description = geminiKey
      ? await describeWithGemini(imageUrl, geminiKey)
      : await describeWithOpenAI(imageUrl, openaiKey!);

    return NextResponse.json({ description: description || "No description available." });
  } catch (error: unknown) {
    console.error("ERROR_DESCRIBE:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error.";
    return new NextResponse(message, { status: 502 });
  }
}

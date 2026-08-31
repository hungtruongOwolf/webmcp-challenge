export { fetchAsBase64 } from "@/app/libs/fetch-base64";

const DEFAULT_MODEL = "gemini-3.6-flash";

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** One-shot generateContent call against Gemini's free tier. */
export async function generateWithGemini(
  parts: GeminiPart[],
  apiKey: string,
  model?: string
): Promise<string | undefined> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || process.env.GEMINI_MODEL || DEFAULT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (status ${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

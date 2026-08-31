const DEFAULT_MODEL = "claude-sonnet-5";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

/** One-shot Messages API call against Claude, for vision/document reading. */
export async function generateWithClaude(
  content: AnthropicContentBlock[],
  apiKey: string,
  model?: string
): Promise<string | undefined> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude request failed (status ${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text?.trim();
}

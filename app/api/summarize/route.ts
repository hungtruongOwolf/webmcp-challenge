import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import { generateWithClaude } from "@/app/libs/anthropic";
import { generateWithGemini } from "@/app/libs/gemini";

export const runtime = "nodejs";

const MAX_MESSAGES = 400;
const MAX_TRANSCRIPT_CHARS = 12_000;

const PROMPT =
  "Below is a chat transcript, oldest first. Summarize it as a coherent story from " +
  "beginning to end -- what was discussed, any plans or decisions made, and how it evolved " +
  "over time. Write it as flowing prose (8-14 sentences, more for a longer or more eventful " +
  "conversation), not a list of messages. Cover the individual topics/threads that came up, " +
  "not just the overall gist. If nothing meaningful happened, say so briefly.";

const generateWithOpenAI = async (prompt: string, apiKey: string) => {
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
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
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

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { conversationId, since } = await req.json();
    if (!conversationId || typeof conversationId !== "string") {
      return new NextResponse("conversationId is required.", { status: 400 });
    }

    let query = supabase
      .from("messages")
      .select(
        "body, image, file_name, created_at, sender:profiles!messages_sender_id_fkey (name)"
      )
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    if (since && typeof since === "string") query = query.gte("created_at", since);

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ summary: "No messages to summarize." });
    }

    const ordered = [...data].reverse();
    const lines = ordered.map((m: any) => {
      const who = m.sender?.name || "Unknown";
      const body = m.image ? "[shared an image]" : m.file_name ? `[shared a file: ${m.file_name}]` : m.body || "";
      return `${who} (${new Date(m.created_at).toISOString()}): ${body}`;
    });

    let transcript = lines.join("\n");
    let transcriptTruncated = false;
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      // Keep the tail (most recent messages) -- the whole point of this
      // feature is catching someone up on what's happened lately, so the
      // newest content is what must survive truncation, not the oldest.
      transcript = "(earlier messages truncated) …\n" + transcript.slice(-MAX_TRANSCRIPT_CHARS);
      transcriptTruncated = true;
    }

    const fullPrompt = `${PROMPT}\n\n${transcript}`;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey && !geminiKey && !openaiKey) {
      return new NextResponse(
        "Summarizing isn't configured yet (set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY).",
        { status: 501 }
      );
    }

    // Each configured provider is actually tried in turn -- a transient
    // failure on one (rate limit, timeout) falls through to the next
    // instead of failing the whole request while other keys sit unused.
    const providers: Array<() => Promise<string | undefined>> = [];
    if (anthropicKey) providers.push(() => generateWithClaude([{ type: "text", text: fullPrompt }], anthropicKey));
    if (geminiKey) providers.push(() => generateWithGemini([{ text: fullPrompt }], geminiKey));
    if (openaiKey) providers.push(() => generateWithOpenAI(fullPrompt, openaiKey));

    let summary: string | undefined;
    let lastError: unknown;
    for (const provider of providers) {
      try {
        summary = await provider();
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (summary === undefined && lastError) throw lastError;

    return NextResponse.json({
      summary: summary || "Could not produce a summary.",
      messageCount: data.length,
      truncated: data.length >= MAX_MESSAGES || transcriptTruncated,
    });
  } catch (error: unknown) {
    console.error("ERROR_SUMMARIZE:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error.";
    return new NextResponse(message, { status: 502 });
  }
}

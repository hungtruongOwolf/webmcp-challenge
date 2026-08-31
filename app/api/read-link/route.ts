import { NextResponse } from "next/server";

import { createClient } from "@/app/libs/supabase/server";
import { safeFetch } from "@/app/libs/safe-fetch";

export const runtime = "nodejs";

const MAX_BYTES = 1_000_000;

/** Strips scripts/styles and tags, collapses whitespace -- no readability library needed for a plain-text summary. */
function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const text = withoutNoise
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function extractTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new NextResponse("Unauthorized.", { status: 401 });

    const { url: rawUrl } = await req.json();
    if (!rawUrl || typeof rawUrl !== "string") {
      return new NextResponse("url is required.", { status: 400 });
    }

    const res = await safeFetch(rawUrl);

    if (!res.ok) {
      return new NextResponse(`Could not fetch that URL (status ${res.status}).`, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "";
    const buffer = await res.arrayBuffer();
    const truncated = buffer.byteLength > MAX_BYTES;
    const raw = Buffer.from(buffer.slice(0, MAX_BYTES)).toString("utf-8");

    if (!contentType.includes("html")) {
      return NextResponse.json({ text: raw + (truncated ? "\n… (truncated)" : "") });
    }

    return NextResponse.json({
      title: extractTitle(raw),
      text: htmlToText(raw) + (truncated ? "\n… (truncated)" : ""),
    });
  } catch (error: unknown) {
    console.error("ERROR_READ_LINK:", error);
    const message = error instanceof Error ? error.message : "Could not read that link.";
    return new NextResponse(message, { status: 502 });
  }
}

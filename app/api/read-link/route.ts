import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { createClient } from "@/app/libs/supabase/server";

export const runtime = "nodejs";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Blocks SSRF: a shared link could point at localhost, a cloud metadata
 * endpoint, or an internal service. Every hop (including redirects) is
 * DNS-resolved and checked before this server fetches it.
 */
function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);

  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }

  if (kind === 6) {
    const norm = ip.toLowerCase();
    if (norm === "::1") return true;
    if (norm.startsWith("fe80:") || norm.startsWith("fc") || norm.startsWith("fd")) return true;
    if (norm.startsWith("::ffff:")) return isPrivateAddress(norm.slice(7));
    return false;
  }

  return true;
}

async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const { address } = await lookup(url.hostname);
  if (isPrivateAddress(address)) {
    throw new Error("That URL points at a private or internal address.");
  }
}

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

    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch {
      return new NextResponse("That doesn't look like a valid URL.", { status: 400 });
    }

    let res: Response | undefined;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertSafeUrl(current);

      res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MessengerCloneBot/1.0)" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        current = new URL(location, current);
        continue;
      }

      break;
    }

    if (!res) return new NextResponse("Could not fetch that URL.", { status: 502 });
    if (res.status >= 300 && res.status < 400) {
      return new NextResponse("Too many redirects.", { status: 502 });
    }
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

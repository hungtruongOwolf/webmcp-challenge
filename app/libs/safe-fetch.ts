import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Blocks SSRF: any URL fetched here can originate from message content an
 * agent read and passed back in (image_url/file_url/url tool arguments), so
 * every hop -- including redirects -- is DNS-resolved and checked before
 * this server fetches it, to stop it reaching localhost, a cloud metadata
 * endpoint, or another internal service.
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

/** SSRF-guarded fetch: validates DNS for every hop, including redirects, before following them. */
export async function safeFetch(
  inputUrl: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  let current: URL;
  try {
    current = new URL(inputUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = init || {};

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current);

    const res = await fetch(current, {
      ...rest,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MessengerCloneBot/1.0)", ...headers },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, current);
      continue;
    }

    return res;
  }

  throw new Error("Too many redirects.");
}

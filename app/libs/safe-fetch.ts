import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Blocks SSRF: any URL fetched here can originate from message content an
 * agent read and passed back in (image_url/file_url/url tool arguments), so
 * every hop -- including redirects -- is DNS-resolved and checked before
 * this server fetches it, to stop it reaching localhost, a cloud metadata
 * endpoint, or another internal service.
 */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);

  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true; // 192.0.0.0/24: IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10: carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15: benchmarking
    if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, broadcast
    if (a === 0) return true;
    return false;
  }

  if (kind === 6) {
    const norm = ip.toLowerCase();
    if (norm === "::1") return true;
    if (norm.startsWith("fe80:") || norm.startsWith("fc") || norm.startsWith("fd")) return true;
    if (norm.startsWith("ff")) return true; // ff00::/8: multicast
    if (norm.startsWith("::ffff:")) return isPrivateAddress(norm.slice(7));
    return false;
  }

  return true;
}

/**
 * Resolves every address a hostname points to (not just the first) and
 * rejects if any of them is private -- an attacker's DNS server can answer
 * differently on a second lookup (DNS rebinding) or round-robin between a
 * public and a private address, so checking one address isn't enough.
 * fetch() re-resolves DNS itself at connect time regardless of what was
 * checked here, so the caller must use the returned addresses to pin the
 * actual connection (see pinnedDispatcher below) rather than calling
 * fetch() with the hostname directly.
 */
async function resolveValidatedAddresses(hostname: string): Promise<LookupAddress[]> {
  const literalKind = isIP(hostname);
  if (literalKind) {
    if (isPrivateAddress(hostname)) {
      throw new Error("That URL points at a private or internal address.");
    }
    return [{ address: hostname, family: literalKind as 4 | 6 }];
  }

  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("Could not resolve that host.");
  }
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error("That URL points at a private or internal address.");
    }
  }
  return records;
}

/**
 * Pins the actual TCP connection to the exact addresses already validated,
 * instead of letting undici resolve DNS again when it connects -- that
 * second, unpinned resolution is exactly what a DNS-rebinding attack
 * exploits (a public address for the check, a private one moments later
 * for the real connection). The Host header and TLS SNI still use the
 * real hostname from the URL, so certificate validation is unaffected.
 */
function pinnedDispatcher(addresses: LookupAddress[]): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0].address, addresses[0].family);
        }
      },
    },
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
  });
}

/** SSRF-guarded fetch: validates and pins DNS for every hop, including redirects, before following them. */
export async function safeFetch(
  inputUrl: string,
  init?: UndiciRequestInit & { timeoutMs?: number }
): Promise<Response> {
  let current: URL;
  try {
    current = new URL(inputUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = init || {};

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${current.protocol}`);
    }

    const addresses = await resolveValidatedAddresses(current.hostname);
    const dispatcher = pinnedDispatcher(addresses);

    const res = await undiciFetch(current, {
      ...rest,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MessengerCloneBot/1.0)", ...headers },
      dispatcher,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res as unknown as Response;
      current = new URL(location, current);
      continue;
    }

    return res as unknown as Response;
  }

  throw new Error("Too many redirects.");
}

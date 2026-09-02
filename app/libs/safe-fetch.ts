import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Blocks SSRF: any URL fetched here can originate from message content an
 * agent read and passed back in (image_url/file_url/url tool arguments), so
 * every hop -- including redirects -- is DNS-resolved and checked before
 * this server fetches it, to stop it reaching localhost, a cloud metadata
 * endpoint, or another internal service.
 */
function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true; // this network
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expands an IPv6 literal (with :: and an optional dotted IPv4 tail) into 8 groups. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip;
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [o1, o2, o3, o4] = dotted[1].split(".").map(Number);
    text = text.slice(0, -dotted[1].length) + `${((o1 << 8) | o2).toString(16)}:${((o3 << 8) | o4).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;

  const groups = [...head, ...Array(missing).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.some(Number.isNaN) ? null : groups;
}

const embeddedIPv4 = (hi: number, lo: number) =>
  `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

function isPrivateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;

  const leadingZeros = g.slice(0, 5).every((x) => x === 0);
  if (leadingZeros && g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (leadingZeros && g[5] === 0xffff) return isPrivateIPv4(embeddedIPv4(g[6], g[7])); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateIPv4(embeddedIPv4(g[6], g[7])); // NAT64
  }
  if (g[0] === 0x2002) return isPrivateIPv4(embeddedIPv4(g[1], g[2])); // 6to4
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true;
}

type Pinned = { address: string; family: number };

/**
 * Resolves every record for the host and refuses if any one is private. A
 * host with one public and one private record, or a zero-TTL rebinding
 * record, would otherwise pass a single-address check and then be
 * re-resolved by the fetch itself. Every record is returned, not just the
 * first: with autoSelectFamily the connector tries them in turn, so an
 * IPv4-only host still reaches a target that lists its AAAA record first.
 */
async function resolvePinned(url: URL): Promise<Pinned[]> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("Could not resolve that host.");
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new Error("That URL points at a private or internal address.");
  }
  return records.map(({ address, family }) => ({ address, family }));
}

/** An Agent whose connector only ever sees addresses that passed the check. */
function pinnedDispatcher(records: Pinned[]): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, records);
        else callback(null, records[0].address, records[0].family);
      },
    },
  });
}

/** SSRF-guarded fetch: validates DNS for every hop, including redirects, and pins each connection. */
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
    const agent = pinnedDispatcher(await resolvePinned(current));

    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(current, {
        ...(rest as Record<string, unknown>),
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MessengerCloneBot/1.0)",
          ...(headers as Record<string, string> | undefined),
        },
      });
    } catch (error) {
      await agent.destroy().catch(() => {});
      throw error;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        await res.body?.cancel().catch(() => {});
        await agent.destroy().catch(() => {});
        current = new URL(location, current);
        continue;
      }
    }

    // close() waits for the in-flight body to finish streaming, so the
    // caller can still read it; the socket goes away once it is drained.
    void agent.close().catch(() => {});
    return res as unknown as Response;
  }

  throw new Error("Too many redirects.");
}

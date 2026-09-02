// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { lookup } from "node:dns/promises";
import { Agent, fetch } from "undici";

import { isPrivateAddress, safeFetch } from "./safe-fetch";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("undici", () => ({
  fetch: vi.fn(),
  Agent: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
}));

type LookupFn = (
  hostname: string,
  options: { all?: boolean },
  callback: (err: Error | null, address: unknown, family?: number) => void
) => void;

const record = (address: string, family: 4 | 6 = 4) => ({ address, family });

const resolveWith = (records: Record<string, ReturnType<typeof record>[]>) =>
  vi.mocked(lookup).mockImplementation(async (hostname: string) => {
    const found = records[hostname];
    if (!found) throw Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
    return found as never;
  });

const okResponse = () => new Response("ok", { status: 200 });

const redirectTo = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

/** The lookup the pinned Agent hands to net.connect, from the nth Agent built. */
const pinnedLookup = (index = 0): LookupFn => {
  const call = vi.mocked(Agent).mock.instances[index] as unknown as {
    options: { connect: { lookup: LookupFn } };
  };
  return call.options.connect.lookup;
};

beforeEach(() => {
  vi.mocked(lookup).mockReset();
  vi.mocked(fetch).mockReset();
  vi.mocked(Agent).mockClear();
  vi.mocked(Agent).prototype.close = vi.fn(async () => {});
  vi.mocked(Agent).prototype.destroy = vi.fn(async () => {});
});

describe("safeFetch", () => {
  it("refuses a hostname with one public and one private record", async () => {
    resolveWith({ "mixed.example": [record("93.184.216.34"), record("10.0.0.5")] });

    await expect(safeFetch("https://mixed.example/a")).rejects.toThrow(/private or internal/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pins the connection to the address it validated", async () => {
    resolveWith({ "public.example": [record("93.184.216.34"), record("2606:2800:220:1:248:1893:25c8:1946", 6)] });
    vi.mocked(fetch).mockResolvedValue(okResponse() as never);

    const res = await safeFetch("https://public.example/a");

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = vi.mocked(fetch).mock.calls[0][1] as { dispatcher?: unknown };
    expect(init.dispatcher).toBe(vi.mocked(Agent).mock.instances[0]);

    // net.connect asks the lookup either for one address or, with
    // autoSelectFamily, for all of them; both shapes must yield only the
    // address that passed the check so a re-resolve cannot swap it.
    const single = vi.fn();
    const all = vi.fn();
    pinnedLookup()("public.example", {}, single);
    pinnedLookup()("public.example", { all: true }, all);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("re-validates and re-pins each redirect hop", async () => {
    resolveWith({
      "first.example": [record("93.184.216.34")],
      "second.example": [record("198.51.100.7")],
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(redirectTo("https://second.example/b") as never)
      .mockResolvedValueOnce(okResponse() as never);

    const res = await safeFetch("https://first.example/a");

    expect(res.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[1][0]).toEqual(new URL("https://second.example/b"));
    const second = vi.fn();
    pinnedLookup(1)("second.example", {}, second);
    expect(second).toHaveBeenCalledWith(null, "198.51.100.7", 4);
  });

  it("refuses a redirect that lands on a private address", async () => {
    resolveWith({
      "first.example": [record("93.184.216.34")],
      "metadata.internal": [record("169.254.169.254")],
    });
    vi.mocked(fetch).mockResolvedValueOnce(redirectTo("http://metadata.internal/latest") as never);

    await expect(safeFetch("https://first.example/a")).rejects.toThrow(/private or internal/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses non-http protocols and a literal private IP without a lookup", async () => {
    resolveWith({});
    vi.mocked(lookup).mockResolvedValue([record("127.0.0.1")] as never);

    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/Unsupported protocol/);
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(/private or internal/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("isPrivateAddress", () => {
  it.each([
    ["0.0.0.0", "this network"],
    ["10.1.2.3", "10/8"],
    ["100.64.0.1", "100.64/10 carrier NAT"],
    ["100.127.255.254", "100.64/10 carrier NAT, top"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["172.16.0.1", "172.16/12"],
    ["172.31.255.255", "172.16/12, top"],
    ["192.168.1.1", "192.168/16"],
    ["198.18.0.1", "198.18/15 benchmarking"],
    ["198.19.255.255", "198.18/15 benchmarking, top"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.255", "multicast, top"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
    ["::", "IPv6 unspecified"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fc00::1", "IPv6 unique local"],
    ["fd12:3456::1", "IPv6 unique local, fd"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["::ffff:a00:1", "IPv4-mapped private, hex form"],
    ["64:ff9b::a00:1", "NAT64 wrapping 10.0.0.1"],
    ["64:ff9b::7f00:1", "NAT64 wrapping 127.0.0.1"],
    ["2002:a00:1::", "6to4 wrapping 10.0.0.1"],
    ["2002:a9fe:a9fe::1", "6to4 wrapping 169.254.169.254"],
    ["not-an-ip", "garbage"],
  ])("treats %s as private (%s)", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    ["93.184.216.34", "public IPv4"],
    ["100.63.255.255", "just below carrier NAT"],
    ["100.128.0.0", "just above carrier NAT"],
    ["198.17.255.255", "just below benchmarking"],
    ["198.20.0.0", "just above benchmarking"],
    ["172.15.255.255", "just below 172.16/12"],
    ["172.32.0.0", "just above 172.16/12"],
    ["2606:2800:220:1:248:1893:25c8:1946", "public IPv6"],
    ["::ffff:93.184.216.34", "IPv4-mapped public"],
    ["64:ff9b::5db8:d822", "NAT64 wrapping a public IPv4"],
    ["2002:5db8:d822::", "6to4 wrapping a public IPv4"],
  ])("lets %s through (%s)", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dns.lookup,
  default: { lookup: dns.lookup },
}));

const undici = vi.hoisted(() => ({
  fetch: vi.fn(),
  lastAgentOptions: null as unknown,
}));

vi.mock("undici", () => ({
  fetch: undici.fetch,
  Agent: class {
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      undici.lastAgentOptions = options;
    }
  },
}));

// Imported after the mocks so safeFetch picks up the mocked node:dns/promises and undici.
const { safeFetch, isPrivateAddress } = await import("./safe-fetch");

describe("isPrivateAddress", () => {
  it.each([
    ["10.0.0.1", true],
    ["127.0.0.1", true],
    ["169.254.1.1", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.1", true],
    ["192.0.0.1", true],
    ["100.64.0.1", true],
    ["100.127.255.255", true],
    ["198.18.0.1", true],
    ["198.19.255.255", true],
    ["224.0.0.1", true],
    ["240.0.0.1", true],
    ["255.255.255.255", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["93.184.216.34", false],
    ["172.15.255.255", false],
    ["172.32.0.0", false],
    ["100.63.255.255", false],
    ["100.128.0.0", false],
  ])("classifies IPv4 %s as private=%s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  it.each([
    ["::1", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["ff02::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:10.0.0.1", true],
    ["2001:4860:4860::8888", false],
    ["::ffff:8.8.8.8", false],
  ])("classifies IPv6 %s as private=%s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe("safeFetch", () => {
  beforeEach(() => {
    dns.lookup.mockReset();
    undici.fetch.mockReset();
    undici.lastAgentOptions = null;
  });

  it("rejects a literal private IP in the URL without any DNS lookup", async () => {
    await expect(safeFetch("http://127.0.0.1/secret")).rejects.toThrow(
      "private or internal"
    );
    expect(dns.lookup).not.toHaveBeenCalled();
    expect(undici.fetch).not.toHaveBeenCalled();
  });

  it("rejects when a hostname resolves to a private address", async () => {
    dns.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(safeFetch("http://internal.example/")).rejects.toThrow(
      "private or internal"
    );
    expect(undici.fetch).not.toHaveBeenCalled();
  });

  it("rejects when ANY of several resolved addresses is private, not just the first", async () => {
    dns.lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 }, // cloud metadata endpoint
    ]);

    await expect(safeFetch("http://multi-homed.example/")).rejects.toThrow(
      "private or internal"
    );
    expect(undici.fetch).not.toHaveBeenCalled();
  });

  it("fetches through a dispatcher pinned to the exact validated addresses, never re-resolving DNS itself", async () => {
    const addresses = [
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ];
    dns.lookup.mockResolvedValue(addresses);
    undici.fetch.mockResolvedValue({ status: 200, headers: new Headers() });

    await safeFetch("http://public.example/file.png");

    expect(undici.fetch).toHaveBeenCalledTimes(1);
    const [, options] = undici.fetch.mock.calls[0];
    expect(options.dispatcher).toBeTruthy();

    // Pull the lookup override out of the constructed Agent and confirm it
    // returns exactly the pre-validated addresses instead of doing a real
    // DNS lookup -- this is what actually closes the rebinding gap.
    const lookupOverride = (undici.lastAgentOptions as { connect: { lookup: Function } })
      .connect.lookup;
    const callback = vi.fn();
    lookupOverride("public.example", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, addresses);
  });

  it("re-validates a redirect target that points at a different, private host", async () => {
    dns.lookup
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    undici.fetch.mockResolvedValueOnce({
      status: 302,
      headers: new Headers({ location: "http://127.0.0.1/admin" }),
    });

    await expect(safeFetch("http://public.example/redirector")).rejects.toThrow(
      "private or internal"
    );
    expect(undici.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported protocol before ever resolving DNS", async () => {
    await expect(safeFetch("ftp://public.example/file")).rejects.toThrow(
      "Unsupported protocol"
    );
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("rejects a hostname that fails to resolve to anything", async () => {
    dns.lookup.mockResolvedValue([]);

    await expect(safeFetch("http://nowhere.example/")).rejects.toThrow(
      "Could not resolve"
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { createToolApiClient } from "./tool-api-client";

describe("createToolApiClient", () => {
  it("uses same-origin credentials and returns JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = createToolApiClient({
      signal: new AbortController().signal,
      onAuthRequired: vi.fn(),
      fetcher,
    });
    await expect(client.request<{ ok: boolean }>("/api/example")).resolves.toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("reports AUTH_REQUIRED once and never retries", async () => {
    const onAuthRequired = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const client = createToolApiClient({
      signal: new AbortController().signal,
      onAuthRequired,
      fetcher,
    });
    await expect(client.request("/api/messages", { method: "POST" })).rejects.toEqual(
      expect.objectContaining({ code: "AUTH_REQUIRED" })
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/app/libs/supabase/server";
import { GET } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));

const exchangeCodeForSession = vi.fn();

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  vi.mocked(createClient).mockResolvedValue({
    auth: { exchangeCodeForSession },
  } as never);
});

describe("GET /auth/callback", () => {
  it("redirects a valid session to the sanitized conversation", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new Request(
      "https://messenger.example/auth/callback?code=good&next=%2Fconversations"
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "https://messenger.example/conversations"
    );
    expect(response.headers.get("set-cookie")).toContain(
      "messenger_focus_after_auth=1"
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=60");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("routes new accounts through optional passkey enrollment", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new Request(
      "https://messenger.example/auth/callback?code=good&next=%2Fusers&enroll=passkey"
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "https://messenger.example/auth/passkey?next=%2Fusers"
    );
    expect(response.headers.get("set-cookie")).toContain(
      "messenger_focus_after_auth=1"
    );
  });

  it("rejects external destinations and reports an invalid link", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });
    const request = new Request(
      "https://messenger.example/auth/callback?code=bad&next=https%3A%2F%2Fattacker.example"
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe(
      "https://messenger.example/?error=auth_link_invalid&next=%2Fconversations"
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

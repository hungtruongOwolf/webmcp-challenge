import { describe, expect, it, vi } from "vitest";

import type { SupabaseBrowserClient } from "@/lib/webmcp/types";
import { signOut } from "./sign-out";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const clientWithAuth = () => {
  const authSignOut = vi.fn(async () => ({ error: null }));
  const client = {
    ...(createFakeSupabase().client as object),
    auth: { signOut: authSignOut },
  } as unknown as SupabaseBrowserClient;
  return { client, authSignOut };
};

describe("sign_out", () => {
  it("asks for confirmation first and signs nothing out", async () => {
    const { client, authSignOut } = clientWithAuth();
    const { ctx, navigated } = createFakeContext(client);

    const result = await signOut(ctx).execute({});

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("confirm: true");
    expect(authSignOut).not.toHaveBeenCalled();
    expect(navigated).toEqual([]);
  });

  it("signs out only this browser once confirmed", async () => {
    const { client, authSignOut } = clientWithAuth();
    const { ctx, navigated } = createFakeContext(client);

    const result = await signOut(ctx).execute({ confirm: true });

    expect(result.isError).toBeUndefined();
    expect(authSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(navigated).toEqual(["/"]);
  });
});

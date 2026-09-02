import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSignUpTool } from "./sign-up-tool";

const gateway = vi.hoisted(() => ({
  signUpWithPasskey: vi.fn(),
}));

vi.mock("@/app/libs/auth/auth-gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/libs/auth/auth-gateway")>();
  return {
    ...actual,
    createAuthGateway: () => gateway,
  };
});

const setLocation = (search: string) => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, search },
  });
};

describe("sign_up tool", () => {
  beforeEach(() => {
    gateway.signUpWithPasskey.mockReset();
    setLocation("");
  });

  it("rejects a missing name without calling the gateway", async () => {
    const tool = createSignUpTool();

    const result = await tool.execute({ email: "new@example.org" });

    expect(result).toEqual({
      content: [{ type: "text", text: "name is required." }],
      isError: true,
    });
    expect(gateway.signUpWithPasskey).not.toHaveBeenCalled();
  });

  it("rejects a missing email without calling the gateway", async () => {
    const tool = createSignUpTool();

    const result = await tool.execute({ name: "Ada Reader" });

    expect(result).toEqual({
      content: [{ type: "text", text: "email is required." }],
      isError: true,
    });
    expect(gateway.signUpWithPasskey).not.toHaveBeenCalled();
  });

  it("signs up with a passkey, defaulting the return path when there's no ?next=", async () => {
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: true,
      value: { hasSession: true },
    });
    const tool = createSignUpTool();

    const result = await tool.execute({ name: "Ada Reader", email: "new@example.org" });

    expect(gateway.signUpWithPasskey).toHaveBeenCalledWith({
      name: "Ada Reader",
      email: "new@example.org",
      returnPath: "/conversations",
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Ada Reader");
    expect(result.content[0].text.toLowerCase()).toContain("signed in");
  });

  it("reads the return path from ?next= when present", async () => {
    setLocation("?next=%2Fusers");
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: true,
      value: { hasSession: true },
    });
    const tool = createSignUpTool();

    await tool.execute({ name: "Ada Reader", email: "new@example.org" });

    expect(gateway.signUpWithPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ returnPath: "/users" })
    );
  });

  it("ignores an unsafe ?next= value the same way sanitizeAuthReturnPath does everywhere else", async () => {
    setLocation("?next=https%3A%2F%2Fattacker.example");
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: true,
      value: { hasSession: true },
    });
    const tool = createSignUpTool();

    await tool.execute({ name: "Ada Reader", email: "new@example.org" });

    expect(gateway.signUpWithPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ returnPath: "/conversations" })
    );
  });

  it("tells the agent to have the person check their email when signup left no session", async () => {
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: true,
      value: { hasSession: false },
    });
    const tool = createSignUpTool();

    const result = await tool.execute({ name: "Ada Reader", email: "new@example.org" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text.toLowerCase()).toContain("confirmation link");
  });

  it("surfaces a cancelled passkey ceremony as a clear, non-technical error", async () => {
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: false,
      code: "PASSKEY_CANCELLED",
    });
    const tool = createSignUpTool();

    const result = await tool.execute({ name: "Ada Reader", email: "new@example.org" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Passkey sign-in cancelled. Choose another sign-in method when ready.",
        },
      ],
      isError: true,
    });
  });

  it("surfaces an already-registered email with actionable guidance", async () => {
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: false,
      code: "ACCOUNT_EXISTS",
    });
    const tool = createSignUpTool();

    const result = await tool.execute({ name: "Ada Reader", email: "new@example.org" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Sign in instead");
  });

  it("trims whitespace from name and email before calling the gateway", async () => {
    gateway.signUpWithPasskey.mockResolvedValue({
      ok: true,
      value: { hasSession: true },
    });
    const tool = createSignUpTool();

    await tool.execute({ name: "  Ada Reader  ", email: "  new@example.org  " });

    expect(gateway.signUpWithPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ada Reader", email: "new@example.org" })
    );
  });

  it("is a public write tool: not read-only, no confirm gate (the WebAuthn prompt is itself the confirmation)", () => {
    const tool = createSignUpTool();

    expect(tool.annotations).toEqual({ readOnlyHint: false });
    expect(tool.inputSchema).toMatchObject({ additionalProperties: false });
  });
});

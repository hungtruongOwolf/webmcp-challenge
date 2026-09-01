import { describe, expect, it } from "vitest";

import { evaluatePasskeyReadiness } from "./passkey-readiness";

describe("evaluatePasskeyReadiness", () => {
  it("reports passkeys ready when origin, relying party, and browser support agree", () => {
    expect(
      evaluatePasskeyReadiness({
        currentOrigin: "https://messenger.example",
        configuredOrigin: "https://messenger.example",
        rpId: "messenger.example",
        hasWebAuthn: true,
      })
    ).toEqual({ status: "ready", message: "Passkeys are available." });
  });

  it("reports a mismatched browser and configured origin as misconfigured", () => {
    expect(
      evaluatePasskeyReadiness({
        currentOrigin: "https://preview.example",
        configuredOrigin: "https://messenger.example",
        rpId: "messenger.example",
        hasWebAuthn: true,
      })
    ).toEqual({
      status: "misconfigured",
      message:
        "Passkeys are temporarily unavailable. Use a password instead.",
    });
  });

  it("reports a relying-party hostname mismatch as misconfigured", () => {
    expect(
      evaluatePasskeyReadiness({
        currentOrigin: "https://messenger.example",
        configuredOrigin: "https://messenger.example",
        rpId: "wrong.example",
        hasWebAuthn: true,
      }).status
    ).toBe("misconfigured");
  });

  it("reports a browser without WebAuthn as unsupported", () => {
    expect(
      evaluatePasskeyReadiness({
        currentOrigin: "https://messenger.example",
        configuredOrigin: "https://messenger.example",
        rpId: "messenger.example",
        hasWebAuthn: false,
      })
    ).toEqual({
      status: "unsupported",
      message:
        "Passkeys are not supported in this browser. Use a password instead.",
    });
  });

  it.each([
    ["not a URL", "https://messenger.example"],
    ["https://messenger.example", "not a URL"],
  ])(
    "reports unparseable current or configured URLs as misconfigured",
    (currentOrigin, configuredOrigin) => {
      expect(
        evaluatePasskeyReadiness({
          currentOrigin,
          configuredOrigin,
          rpId: "messenger.example",
          hasWebAuthn: true,
        }).status
      ).toBe("misconfigured");
    }
  );

  it("permits HTTP on localhost for local development", () => {
    expect(
      evaluatePasskeyReadiness({
        currentOrigin: "http://localhost:3000",
        configuredOrigin: "http://localhost:3000",
        rpId: "localhost",
        hasWebAuthn: true,
      })
    ).toEqual({ status: "ready", message: "Passkeys are available." });
  });

  it("requires HTTPS for a non-local hostname", () => {
    expect(
      evaluatePasskeyReadiness({
        currentOrigin: "http://messenger.example",
        configuredOrigin: "http://messenger.example",
        rpId: "messenger.example",
        hasWebAuthn: true,
      }).status
    ).toBe("misconfigured");
  });

  it.each([
    "https://messenger.example/path",
    "https://messenger.example?preview=true",
    "https://messenger.example#details",
    "https://user:password@messenger.example",
  ])(
    "rejects a configured value with non-origin URL components: %s",
    (configuredOrigin) => {
      expect(
        evaluatePasskeyReadiness({
          currentOrigin: "https://messenger.example",
          configuredOrigin,
          rpId: "messenger.example",
          hasWebAuthn: true,
        }).status
      ).toBe("misconfigured");
    }
  );
});

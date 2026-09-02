import { describe, expect, it } from "vitest";
import {
  buildAuthCallbackUrl,
  buildAuthLandingPath,
  buildPasskeyEnrollmentPath,
  sanitizeAuthReturnPath,
} from "./return-path";

describe("sanitizeAuthReturnPath", () => {
  it.each(["/users", "/conversations", "/conversations/5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"])(
    "accepts %s",
    (path) => expect(sanitizeAuthReturnPath(path)).toBe(path)
  );

  it.each([
    undefined,
    null,
    "",
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/conversations/not-a-uuid",
    "/settings",
    "/conversations?next=https://attacker.example",
  ])("replaces unsafe value %s", (path) => {
    expect(sanitizeAuthReturnPath(path)).toBe("/conversations");
  });
});

it("builds encoded sign-in, callback, and enrollment locations", () => {
  const conversation = "/conversations/5c6e7dd2-5ea2-4878-bd79-63b089ee23f4";
  expect(buildAuthLandingPath(conversation)).toBe(
    "/?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"
  );
  expect(buildAuthCallbackUrl("https://messenger.example", conversation, true)).toBe(
    "https://messenger.example/auth/callback?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4&enroll=passkey"
  );
  expect(buildPasskeyEnrollmentPath(conversation)).toBe(
    "/auth/passkey?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"
  );
  expect(buildPasskeyEnrollmentPath(conversation, true)).toBe(
    "/auth/passkey?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4&auto=1"
  );
  expect(buildPasskeyEnrollmentPath(conversation, false)).toBe(
    "/auth/passkey?next=%2Fconversations%2F5c6e7dd2-5ea2-4878-bd79-63b089ee23f4"
  );
});

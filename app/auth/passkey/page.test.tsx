import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import PasskeyPage from "./page";

vi.mock("@/app/components/auth/passkey-enrollment", () => ({
  PasskeyEnrollment: () => null,
}));

it("exposes the callback-to-enrollment heading as the one-shot focus target", async () => {
  render(
    await PasskeyPage({
      searchParams: Promise.resolve({ next: "/conversations" }),
    })
  );

  expect(screen.getByRole("heading", { name: "Add a passkey?" })).toHaveAttribute(
    "data-page-title"
  );
  expect(screen.getByRole("heading", { name: "Add a passkey?" })).toHaveAttribute(
    "tabindex",
    "-1"
  );
});

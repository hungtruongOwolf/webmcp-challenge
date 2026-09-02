import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/app/types";

import DirectoryModal from "./directory-modal";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/app/components/avatar", () => ({
  default: () => null,
}));

const mom = {
  id: "mom",
  name: "Mom",
  email: "mom@example.org",
} as User;

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const renderDirectory = () =>
  render(
    <DirectoryModal
      users={[mom]}
      isOpen
      onClose={vi.fn()}
      onOpenNewGroup={vi.fn()}
    />
  );

describe("DirectoryModal", () => {
  beforeEach(() => {
    navigation.push.mockReset();
  });

  it("marks the clicked row busy, announces it, and blocks a second click", async () => {
    const user = userEvent.setup();
    const request = deferred<{ data: { id: string } }>();
    vi.mocked(axios.post).mockReturnValue(request.promise as never);
    renderDirectory();

    const button = screen.getByRole("button", { name: "Message Mom" });
    await user.click(button);
    await user.click(button);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveTextContent("Opening chat");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Opening chat with Mom"
    );

    request.resolve({ data: { id: "conversation-1" } });
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/conversations/conversation-1"
      )
    );
  });

  it("returns the row to idle and reports a failure", async () => {
    const user = userEvent.setup();
    vi.mocked(axios.post).mockRejectedValue(new Error("offline"));
    renderDirectory();

    const button = screen.getByRole("button", { name: "Message Mom" });
    await user.click(button);

    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-busy", "true")
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not open a chat with Mom"
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { expect, it, vi } from "vitest";

import AuthForm from "@/app/(site)/components/auth-form";
import Input from "@/app/components/inputs/input";
import SettingsModal from "@/app/components/modals/settings-modal";
import GroupChatModal from "@/app/conversations/components/group-chat-modal";
import type { User } from "@/app/types";
import { WebMCPConnectionProvider } from "@/app/webmcp/connection-provider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/context/current-user-context", () => ({
  useCurrentUser: () => null,
}));

vi.mock("@/app/libs/supabase/client", () => ({
  createClient: () => ({ auth: {} }),
}));

vi.mock("@/app/components/passkey-manager", () => ({
  default: () => null,
}));

vi.mock("@/app/components/modals/modal", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/app/components/inputs/select", () => ({
  default: () => null,
}));

vi.mock("next-cloudinary", () => ({
  CldUploadButton: ({ children }: { children: ReactNode }) => children,
}));

type FormValues = { password: string };

const Harness = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  return (
    <form noValidate onSubmit={handleSubmit(() => undefined)}>
      <Input<FormValues>
        id="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        register={register}
        errors={errors}
      />
      <button type="submit">Submit</button>
    </form>
  );
};

it("renders native and ARIA password validation semantics", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  expect(screen.getByLabelText("Password")).toBeRequired();
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "autocomplete",
    "current-password"
  );

  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  expect(screen.getByText("Password is required.")).toHaveAttribute(
    "id",
    "password-error"
  );
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "aria-describedby",
    "password-error"
  );
});

it("reports custom errors when the production authentication form is submitted blank", async () => {
  const user = userEvent.setup();
  render(
    <WebMCPConnectionProvider modelContext={null} currentUserId={null}>
      <AuthForm returnPath="/conversations" />
    </WebMCPConnectionProvider>
  );

  await user.click(
    await screen.findByRole("button", { name: "Sign in with password" })
  );

  expect(screen.getByText("Email is required.")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
});

it("reports custom errors when the production settings form is submitted blank", async () => {
  const user = userEvent.setup();
  const currentUser: User = {
    id: "user-id",
    name: "",
    email: "blind.user@example.org",
    image: null,
    created_at: "2026-08-30T18:00:00.000Z",
    updated_at: "2026-08-30T18:00:00.000Z",
  };
  render(
    <SettingsModal
      isOpen
      onClose={() => undefined}
      currentUser={currentUser}
    />
  );

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByText("Name is required.")).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
});

it("reports custom errors when the production group form is submitted blank", async () => {
  const user = userEvent.setup();
  render(
    <GroupChatModal users={[]} isOpen onClose={() => undefined} />
  );

  await user.click(screen.getByRole("button", { name: "Create" }));

  expect(screen.getByText("Name is required.")).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
});

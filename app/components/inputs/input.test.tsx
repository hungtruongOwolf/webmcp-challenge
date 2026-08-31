import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { expect, it } from "vitest";

import Input from "@/app/components/inputs/input";

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

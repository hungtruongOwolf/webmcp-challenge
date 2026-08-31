"use client";

import clsx from "clsx";
import type { HTMLInputTypeAttribute } from "react";
import type {
  FieldErrors,
  FieldValues,
  Path,
  RegisterOptions,
  UseFormRegister,
} from "react-hook-form";
import { get } from "react-hook-form";

type InputProps<T extends FieldValues> = {
  label: string;
  id: Path<T>;
  type?: HTMLInputTypeAttribute;
  required?: boolean;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  placeholder?: string;
  disabled?: boolean;
  autoComplete: string;
  registerOptions?: RegisterOptions<T, Path<T>>;
};

const Input = <T extends FieldValues,>({
  label,
  id,
  type = "text",
  required,
  register,
  errors,
  placeholder,
  disabled,
  autoComplete,
  registerOptions,
}: InputProps<T>) => {
  const error = get(errors, id);
  const errorMessage =
    typeof error?.message === "string" ? error.message : undefined;
  const errorId = `${id}-error`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t2)" }}
      >
        {label}
      </label>

      <div className="mt-2">
        <input
          type={type}
          placeholder={placeholder}
          id={id}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={errorMessage ? errorId : undefined}
          {...register(id, {
            ...registerOptions,
            required: required ? `${label} is required.` : false,
          })}
          className={clsx(
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
            error && "focus-visible:outline-rose-600",
            disabled && "opacity-50 cursor-default"
          )}
          style={{
            minHeight: 42,
            width: "100%",
            padding: "0 12px",
            border: "none",
            borderRadius: 10,
            background: "var(--bub-in)",
            color: "var(--t1)",
            fontSize: 14,
            boxShadow: error
              ? "inset 0 0 0 1.5px #e5484d"
              : "inset 0 0 0 0.5px var(--hair)",
          }}
        />
      </div>

      {errorMessage && (
        <p id={errorId} style={{ margin: 0, fontSize: 12, color: "#c73e43" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default Input;

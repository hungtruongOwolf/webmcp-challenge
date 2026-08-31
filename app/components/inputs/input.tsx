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
    <div className="gap-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium leading-6 text-gray-900"
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
            "form-input block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6",
            error && "focus:ring-rose-500",
            disabled && "opacity-50 cursor-default"
          )}
        />
      </div>

      {errorMessage && <p id={errorId}>{errorMessage}</p>}
    </div>
  );
};

export default Input;

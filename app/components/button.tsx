"use client";

import clsx from "clsx";

type ButtonProps = {
  type?: "submit" | "reset" | "button" | undefined;
  fullWidth?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

const Button: React.FC<ButtonProps> = ({
  type,
  fullWidth,
  children,
  onClick,
  secondary,
  danger,
  disabled,
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex justify-center px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        disabled && "opacity-50 cursor-default",
        fullWidth && "w-full",
        danger
          ? "focus-visible:outline-rose-600"
          : "focus-visible:outline-sky-600"
      )}
      style={{
        minHeight: 42,
        border: "none",
        borderRadius: 10,
        background: danger
          ? "#e5484d"
          : secondary
            ? "var(--hover)"
            : "var(--accent)",
        color: secondary ? "var(--t1)" : "#fff",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
};

export default Button;

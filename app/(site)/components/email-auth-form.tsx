"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import Button from "@/app/components/button";
import Input from "@/app/components/inputs/input";
import {
  authFailureMessage,
  type AuthGateway,
} from "@/app/libs/auth/auth-gateway";
import { useWebMCPConnection } from "@/app/webmcp/connection-provider";

export type EmailAuthValues = {
  name: string;
  email: string;
  password: string;
};

export type EmailAuthFormProps = {
  variant: "LOGIN" | "REGISTER";
  returnPath: string;
  gateway: AuthGateway;
  onAuthenticated: () => void;
  onPasskeyEnrollment: () => void;
  isPending: boolean;
  onSubmissionStart: () => boolean;
  onSubmissionEnd: () => void;
  operationError: string | null;
  onOperationError: (message: string | null) => void;
  passkeyReady?: boolean;
};

export const EmailAuthForm = ({
  variant,
  returnPath,
  gateway,
  onAuthenticated,
  onPasskeyEnrollment,
  isPending,
  onSubmissionStart,
  onSubmissionEnd,
  operationError,
  onOperationError,
  passkeyReady = false,
}: EmailAuthFormProps) => {
  const { beginAuthentication, returnToSignedOut } = useWebMCPConnection();
  const [focusSummaryRequested, setFocusSummaryRequested] = useState(false);
  const [passkeySignup, setPasskeySignup] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const usingPasskeySignup = variant === "REGISTER" && passkeyReady && passkeySignup;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmailAuthValues>({
    defaultValues: { name: "", email: "", password: "" },
  });

  const focusSummary = () => {
    setFocusSummaryRequested(true);
  };

  useEffect(() => {
    if (!operationError || !summaryRef.current) return;
    summaryRef.current.focus();
  }, [operationError]);

  useEffect(() => {
    if (!focusSummaryRequested || operationError || !summaryRef.current) return;
    summaryRef.current.focus();
    setFocusSummaryRequested(false);
  }, [errors, focusSummaryRequested, operationError]);

  const focusValidationSummary = () => {
    onOperationError(null);
    focusSummary();
  };

  const submitPassword = async (values: EmailAuthValues) => {
    if (!onSubmissionStart()) return;

    if (usingPasskeySignup) {
      beginAuthentication();
      const result = await gateway.signUpWithPasskey({
        name: values.name,
        email: values.email,
        returnPath,
      });
      onSubmissionEnd();
      if (!result.ok) {
        const message = authFailureMessage(result.code);
        returnToSignedOut("");
        onOperationError(message);
        return;
      }
      if (result.value.hasSession) {
        onPasskeyEnrollment();
        return;
      }
      returnToSignedOut("Check your email to finish creating your account.");
      return;
    }

    if (!values.password) {
      onSubmissionEnd();
      setError("password", {
        type: "required",
        message: "Password is required.",
      });
      focusSummary();
      return;
    }

    beginAuthentication();
    if (variant === "LOGIN") {
      const result = await gateway.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      onSubmissionEnd();
      if (!result.ok) {
        const message = authFailureMessage(result.code);
        returnToSignedOut("");
        onOperationError(message);
        return;
      }
      onAuthenticated();
      return;
    }

    const result = await gateway.signUpWithPassword({
      name: values.name,
      email: values.email,
      password: values.password,
      returnPath,
    });
    onSubmissionEnd();
    if (!result.ok) {
      const message = authFailureMessage(result.code);
      returnToSignedOut("");
      onOperationError(message);
      return;
    }

    if (result.value.hasSession) {
      onPasskeyEnrollment();
      return;
    }

    returnToSignedOut("Check your email to finish creating your account.");
  };

  const passwordAction = handleSubmit(submitPassword, focusValidationSummary);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        onOperationError(null);
        void passwordAction(event);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {(operationError || Object.keys(errors).length > 0) && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          style={{
            borderRadius: 10,
            padding: 12,
            background: "var(--sel)",
            color: "var(--t1)",
            fontSize: 13,
          }}
        >
          {operationError ?? "Check the highlighted fields and try again."}
        </div>
      )}

      {variant === "REGISTER" && (
        <Input<EmailAuthValues>
          type="text"
          id="name"
          label="Name"
          autoComplete="name"
          register={register}
          errors={errors}
          disabled={isPending}
          required
        />
      )}

      <Input<EmailAuthValues>
        type="email"
        id="email"
        label="Email"
        autoComplete="email"
        register={register}
        errors={errors}
        disabled={isPending}
        required
      />

      {variant === "REGISTER" && passkeyReady && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--t2)",
          }}
        >
          <input
            type="checkbox"
            checked={passkeySignup}
            onChange={(event) => setPasskeySignup(event.target.checked)}
            disabled={isPending}
          />
          Use a passkey instead of a password
        </label>
      )}

      {!usingPasskeySignup && (
        <Input<EmailAuthValues>
          type="password"
          id="password"
          label="Password"
          autoComplete={variant === "LOGIN" ? "current-password" : "new-password"}
          register={register}
          errors={errors}
          disabled={isPending}
          registerOptions={
            variant === "REGISTER"
              ? {
                  minLength: {
                    value: 6,
                    message: "Password should be at least 6 characters.",
                  },
                }
              : undefined
          }
        />
      )}

      <Button type="submit" disabled={isPending} fullWidth>
        {variant === "LOGIN"
          ? "Sign in"
          : usingPasskeySignup
            ? "Create account with a passkey"
            : "Create account"}
      </Button>
    </form>
  );
};

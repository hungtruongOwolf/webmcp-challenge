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
}: EmailAuthFormProps) => {
  const { beginAuthentication, returnToSignedOut } = useWebMCPConnection();
  const [focusSummaryRequested, setFocusSummaryRequested] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
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

  const sendEmailLink = async (values: EmailAuthValues) => {
    if (!onSubmissionStart()) return;
    onOperationError(null);
    beginAuthentication();
    const result = await gateway.sendEmailLink({
      email: values.email,
      ...(variant === "REGISTER" ? { name: values.name } : {}),
      returnPath,
      shouldCreateUser: variant === "REGISTER",
    });
    onSubmissionEnd();

    if (!result.ok) {
      const message = authFailureMessage(result.code);
      returnToSignedOut("");
      onOperationError(message);
      return;
    }

    returnToSignedOut(
      variant === "LOGIN"
        ? "Sign-in link sent. Check your email."
        : "Check your email to finish creating your account."
    );
  };

  const submitPassword = async (values: EmailAuthValues) => {
    if (!onSubmissionStart()) return;

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

  const emailLinkAction = () => {
    onOperationError(null);
    clearErrors("password");
    void handleSubmit(sendEmailLink, focusValidationSummary)();
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

      <Button
        type="button"
        onClick={emailLinkAction}
        disabled={isPending}
        fullWidth
      >
        Email me a sign-in link
      </Button>

      <div
        role="separator"
        aria-label="or use a password"
        style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--t3)" }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--hair)" }} aria-hidden="true" />
        <span aria-hidden="true">or use a password</span>
        <span style={{ flex: 1, height: 1, background: "var(--hair)" }} aria-hidden="true" />
      </div>

      <Input<EmailAuthValues>
        type="password"
        id="password"
        label="Password"
        autoComplete={
          variant === "LOGIN" ? "current-password" : "new-password"
        }
        register={register}
        errors={errors}
        disabled={isPending}
      />

      <Button type="submit" disabled={isPending} fullWidth secondary>
        {variant === "LOGIN"
          ? "Sign in with password"
          : "Create account with password"}
      </Button>
    </form>
  );
};

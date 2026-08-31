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
}: EmailAuthFormProps) => {
  const { beginAuthentication, returnToSignedOut } = useWebMCPConnection();
  const [focusSummaryRequested, setFocusSummaryRequested] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
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
    if (!focusSummaryRequested || !summaryRef.current) return;
    summaryRef.current.focus();
    setFocusSummaryRequested(false);
  }, [errors, focusSummaryRequested, operationError]);

  const focusValidationSummary = () => {
    setOperationError(null);
    focusSummary();
  };

  const sendEmailLink = async (values: EmailAuthValues) => {
    if (!onSubmissionStart()) return;
    setOperationError(null);
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
      returnToSignedOut(message);
      setOperationError(message);
      focusSummary();
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
    setOperationError(null);

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
        returnToSignedOut(message);
        setOperationError(message);
        focusSummary();
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
      returnToSignedOut(message);
      setOperationError(message);
      focusSummary();
      return;
    }

    if (result.value.hasSession) {
      onPasskeyEnrollment();
      return;
    }

    returnToSignedOut("Check your email to finish creating your account.");
  };

  const emailLinkAction = () => {
    clearErrors("password");
    void handleSubmit(sendEmailLink, focusValidationSummary)();
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(submitPassword, focusValidationSummary)}
      className="space-y-6"
    >
      {(operationError || Object.keys(errors).length > 0) && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
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
        className="flex items-center gap-3 text-sm text-gray-500"
      >
        <span className="h-px flex-1 bg-gray-300" aria-hidden="true" />
        <span aria-hidden="true">or use a password</span>
        <span className="h-px flex-1 bg-gray-300" aria-hidden="true" />
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

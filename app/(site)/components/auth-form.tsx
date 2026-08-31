"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { HiOutlineFingerPrint } from "react-icons/hi2";

import { createClient } from "@/app/libs/supabase/client";
import { useCurrentUser } from "@/app/context/current-user-context";

type Variant = "LOGIN" | "REGISTER";

const cardStyle: React.CSSProperties = {
  width: "100%",
  padding: 24,
  borderRadius: 22,
  boxShadow: "var(--e2), inset 0 1px 0 var(--hi)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  height: 44,
  border: "none",
  borderRadius: 10,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
});

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--t2)",
};

const fieldInputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  border: "none",
  borderRadius: 10,
  background: "var(--bub-in)",
  color: "var(--t1)",
  fontSize: 14,
  outline: "none",
  boxShadow: "inset 0 0 0 0.5px var(--hair)",
};

const AuthForm = () => {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [supabase] = useState(() => createClient());

  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [isLoading, setIsLoading] = useState(false);
  const [canUsePasskeys, setCanUsePasskeys] = useState(false);
  // Set after email signup: the account now exists and is confirmed, which is
  // exactly the state Supabase requires before a passkey can be enrolled.
  const [offerEnrollment, setOfferEnrollment] = useState(false);

  useEffect(() => {
    setCanUsePasskeys(
      typeof window !== "undefined" && !!window.PublicKeyCredential
    );
  }, []);

  useEffect(() => {
    if (currentUser && !offerEnrollment) router.push("/conversations");
  }, [currentUser, offerEnrollment, router]);

  const toggleVariant = useCallback(
    () => setVariant((v) => (v === "LOGIN" ? "REGISTER" : "LOGIN")),
    []
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    defaultValues: { name: "", email: "", password: "" },
  });

  const enter = () => {
    router.push("/conversations");
    router.refresh();
  };

  /** The everyday door: no email typed, the browser offers known credentials. */
  const signInWithPasskey = async () => {
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;

      toast.success("Welcome back.");
      enter();
    } catch (error: any) {
      // Dismissing the OS prompt is a choice, not a failure worth shouting about.
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
        return;
      }
      toast.error("No passkey found for this device. Sign in below instead.");
    } finally {
      setIsLoading(false);
    }
  };

  /** Bootstrap only: creates the confirmed account a passkey can attach to. */
  const onSubmit: SubmitHandler<FieldValues> = async (data) => {
    setIsLoading(true);

    try {
      if (variant === "REGISTER") {
        const { error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: { data: { name: data.name } },
        });
        if (error) throw error;

        toast.success("Account created.");
        if (canUsePasskeys) {
          setOfferEnrollment(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;

        toast.success("You are logged in.");
      }

      enter();
    } catch (error: any) {
      toast.error(error?.message ?? "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const enrollPasskey = async () => {
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;

      toast.success("Passkey saved. Next time, one tap.");
    } catch (error: any) {
      if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
        toast.error(error?.message ?? "Could not save the passkey.");
      }
    } finally {
      setIsLoading(false);
      enter();
    }
  };

  if (offerEnrollment) {
    return (
      <div className="gm-glass2" style={{ ...cardStyle, alignItems: "center", textAlign: "center" }}>
        <span
          aria-hidden
          style={{
            width: 60,
            height: 60,
            borderRadius: 999,
            background: "var(--sel)",
            color: "var(--accent-t)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <HiOutlineFingerPrint size={30} />
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--t1)" }}>
            Add a passkey?
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--t2)" }}>
            Sign in with your fingerprint, face, or device PIN instead of typing a password.
          </p>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={enrollPasskey}
            disabled={isLoading}
            style={primaryButtonStyle(isLoading)}
          >
            Set up passkey
          </button>
          <button
            type="button"
            onClick={enter}
            disabled={isLoading}
            style={{ background: "none", border: "none", padding: 4, fontSize: 13, fontWeight: 500, color: "var(--t3)", cursor: "pointer" }}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-glass2" style={cardStyle}>
      {canUsePasskeys && (
        <>
          <button
            type="button"
            onClick={signInWithPasskey}
            disabled={isLoading}
            style={primaryButtonStyle(isLoading)}
          >
            <HiOutlineFingerPrint size={19} aria-hidden />
            Sign in with a passkey
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, height: 1, background: "var(--hair)" }} aria-hidden />
            <span style={{ flex: "none", fontSize: 12, color: "var(--t3)" }}>or use your email</span>
            <span style={{ flex: 1, height: 1, background: "var(--hair)" }} aria-hidden />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {variant === "REGISTER" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={fieldLabelStyle}>Name</span>
            <input
              type="text"
              id="name"
              placeholder="John Doe"
              autoComplete="name"
              disabled={isLoading}
              {...register("name", { required: true })}
              style={{
                ...fieldInputStyle,
                boxShadow: errors.name
                  ? "inset 0 0 0 1.5px #e5484d"
                  : fieldInputStyle.boxShadow,
              }}
            />
          </label>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabelStyle}>Email Address</span>
          <input
            type="email"
            id="email"
            placeholder="johndoe@email.com"
            autoComplete="email"
            disabled={isLoading}
            {...register("email", { required: true })}
            style={{
              ...fieldInputStyle,
              boxShadow: errors.email
                ? "inset 0 0 0 1.5px #e5484d"
                : fieldInputStyle.boxShadow,
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabelStyle}>Password</span>
          <input
            type="password"
            id="password"
            placeholder="••••••••••"
            autoComplete="current-password"
            disabled={isLoading}
            {...register("password", { required: true })}
            style={{
              ...fieldInputStyle,
              boxShadow: errors.password
                ? "inset 0 0 0 1.5px #e5484d"
                : fieldInputStyle.boxShadow,
            }}
          />
        </label>

        <button type="submit" disabled={isLoading} style={{ ...primaryButtonStyle(isLoading), marginTop: 2 }}>
          {variant === "LOGIN" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div style={{ display: "flex", justifyContent: "center", gap: 6, fontSize: 13 }}>
        <span style={{ color: "var(--t3)" }}>
          {variant === "LOGIN" ? "New to Messenger?" : "Already have an account?"}
        </span>

        <button
          type="button"
          onClick={toggleVariant}
          style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: "var(--accent-t)", cursor: "pointer" }}
        >
          {variant === "LOGIN" ? "Create an account" : "Log in"}
        </button>
      </div>
    </div>
  );
};

export default AuthForm;

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { HiOutlineFingerPrint } from "react-icons/hi2";

import Input from "@/app/components/inputs/input";
import Button from "@/app/components/button";
import { createClient } from "@/app/libs/supabase/client";
import { useCurrentUser } from "@/app/context/current-user-context";

type Variant = "LOGIN" | "REGISTER";

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
    if (currentUser && !offerEnrollment) router.push("/users");
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
    router.push("/users");
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
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-4 py-8 shadow-sm rounded-lg sm:px-10 text-center">
          <HiOutlineFingerPrint
            size={44}
            className="mx-auto text-sky-500"
            aria-hidden
          />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            Add a passkey?
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in with your fingerprint, face, or device PIN instead of typing
            a password.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              onClick={enrollPasskey}
              disabled={isLoading}
              fullWidth
            >
              Set up passkey
            </Button>
            <button
              type="button"
              onClick={enter}
              className="text-sm text-gray-500 underline cursor-pointer"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="bg-white px-4 py-8 shadow-sm rounded-lg sm:px-10">
        {canUsePasskeys && (
          <>
            <button
              type="button"
              onClick={signInWithPasskey}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-50"
            >
              <HiOutlineFingerPrint size={20} aria-hidden />
              Sign in with a passkey
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div
                  role="separator"
                  className="w-full border-t border-gray-300"
                  aria-hidden
                />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">
                  or use your email
                </span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {variant === "REGISTER" && (
            <Input
              type="text"
              id="name"
              label="Name"
              autoComplete="name"
              placeholder="John Doe"
              register={register}
              errors={errors}
              disabled={isLoading}
              required
            />
          )}

          <Input
            type="email"
            id="email"
            label="Email Address"
            autoComplete="email"
            placeholder="johndoe@email.com"
            register={register}
            errors={errors}
            disabled={isLoading}
            required
          />

          <Input
            type="password"
            id="password"
            label="Password"
            autoComplete={
              variant === "LOGIN" ? "current-password" : "new-password"
            }
            placeholder="••••••••••"
            register={register}
            errors={errors}
            disabled={isLoading}
            required
          />

          <Button type="submit" disabled={isLoading} fullWidth secondary>
            {variant === "LOGIN" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="flex gap-2 justify-center text-sm mt-6 px-2 text-gray-500">
          <p>
            {variant === "LOGIN"
              ? "New to Messenger?"
              : "Already have an account?"}
          </p>

          <button
            type="button"
            onClick={toggleVariant}
            className="underline cursor-pointer"
          >
            {variant === "LOGIN" ? "Create an account" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;

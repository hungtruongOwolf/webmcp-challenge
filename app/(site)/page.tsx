import Image from "next/image";

import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";

import AuthForm from "./components/auth-form";

type HomeProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const returnPath = sanitizeAuthReturnPath(params.next);
  const callbackError =
    params.error === "auth_link_invalid" ? "auth_link_invalid" : undefined;

  return (
    <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Image
          src="/images/logo.png"
          alt="Messenger"
          height={48}
          width={48}
          className="mx-auto w-auto"
        />

        <h1 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Continue with your account
        </h1>
      </div>

      <AuthForm returnPath={returnPath} callbackError={callbackError} />
    </div>
  );
}

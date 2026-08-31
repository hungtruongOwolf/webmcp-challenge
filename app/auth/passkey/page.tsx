import { PasskeyEnrollment } from "@/app/components/auth/passkey-enrollment";
import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";

type PasskeyPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function PasskeyPage({ searchParams }: PasskeyPageProps) {
  const { next } = await searchParams;
  const returnPath = sanitizeAuthReturnPath(
    typeof next === "string" ? next : undefined
  );

  return (
    <main className="flex min-h-full items-center justify-center bg-gray-100 px-4 py-12">
      <section className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1
          data-page-title
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900"
        >
          Add a passkey?
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Use your device PIN, a biometric such as your fingerprint or face,
          or a security key for a faster sign-in next time. You can also add
          or remove passkeys later in settings.
        </p>
        <PasskeyEnrollment returnPath={returnPath} />
      </section>
    </main>
  );
}

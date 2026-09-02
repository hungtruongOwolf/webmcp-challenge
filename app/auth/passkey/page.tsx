import AuthShell from "@/app/(site)/components/auth-shell";
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
    <AuthShell title="Add a passkey?" titleIsFocusTarget>
      <PasskeyEnrollment returnPath={returnPath} />
    </AuthShell>
  );
}

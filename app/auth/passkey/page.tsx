import AuthShell from "@/app/(site)/components/auth-shell";
import { PasskeyEnrollment } from "@/app/components/auth/passkey-enrollment";
import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";

type PasskeyPageProps = {
  searchParams: Promise<{ next?: string | string[]; auto?: string | string[] }>;
};

export default async function PasskeyPage({ searchParams }: PasskeyPageProps) {
  const { next, auto } = await searchParams;
  const returnPath = sanitizeAuthReturnPath(
    typeof next === "string" ? next : undefined
  );
  const autoStart = auto === "1";

  return (
    <AuthShell title="Add a passkey?" titleIsFocusTarget>
      <PasskeyEnrollment returnPath={returnPath} autoStart={autoStart} />
    </AuthShell>
  );
}

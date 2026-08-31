import { sanitizeAuthReturnPath } from "@/app/libs/auth/return-path";
import AuthForm from "./components/auth-form";
import AuthShell from "./components/auth-shell";

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
    <AuthShell>
      <AuthForm returnPath={returnPath} callbackError={callbackError} />
    </AuthShell>
  );
}

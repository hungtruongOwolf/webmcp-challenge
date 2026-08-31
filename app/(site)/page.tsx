import AuthForm from "./components/auth-form";
import AuthShell from "./components/auth-shell";

export default function Home() {
  return (
    <AuthShell>
      <AuthForm />
    </AuthShell>
  );
}

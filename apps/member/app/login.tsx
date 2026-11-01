import { AuthCard } from "../src/components/auth-card";
import { LoginForm } from "../src/components/login-forms";
import { Guard, useAuth } from "../src/lib/auth";
import { loginClient } from "../src/lib/supabase";
import { strings } from "../src/strings";

export default function LoginScreen() {
  const { startSession } = useAuth();
  return (
    <Guard route="login">
      <AuthCard title={strings.loginTitle}>
        <LoginForm client={loginClient} onCodeSent={startSession} />
      </AuthCard>
    </Guard>
  );
}

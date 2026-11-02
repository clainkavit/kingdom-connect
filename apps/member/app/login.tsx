import { AuthCard } from "../src/components/auth-card";
import { LoginForm } from "../src/components/login-forms";
import { Guard, useAuth } from "../src/lib/auth";
import { loginClient } from "../src/lib/supabase";
import { useLanguage } from "../src/lib/language";

export default function LoginScreen() {
  const { startSession } = useAuth();
  const { t, platformName } = useLanguage();
  return (
    <Guard route="login">
      <AuthCard title={platformName ? t.loginTitle(platformName) : t.logIn}>
        <LoginForm client={loginClient} onCodeSent={startSession} />
      </AuthCard>
    </Guard>
  );
}

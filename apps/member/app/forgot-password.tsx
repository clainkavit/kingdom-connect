import { useRouter } from "expo-router";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { ForgotPasswordForm } from "../src/components/login-forms";
import { useLanguage } from "../src/lib/language";
import { loginClient } from "../src/lib/supabase";

export default function ForgotPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const logIn = () => router.replace("/login");
  return (
    <AuthCard title={t.forgotTitle}>
      <ForgotPasswordForm client={loginClient} onLogIn={logIn} />
      <TextButton label={t.logIn} onPress={logIn} />
    </AuthCard>
  );
}

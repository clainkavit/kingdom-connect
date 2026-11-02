import { useRouter } from "expo-router";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { SignUpForm } from "../src/components/sign-up-form";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";
import { loginClient, registrationClient } from "../src/lib/supabase";

export default function SignUpScreen() {
  const { startSession } = useAuth();
  const { t, platformName } = useLanguage();
  const router = useRouter();
  return (
    <Guard route="login">
      <AuthCard title={platformName ? t.signUpTitle(platformName) : t.createAccount}>
        <SignUpForm
          registration={registrationClient}
          login={loginClient}
          onCodeSent={startSession}
        />
        <TextButton label={t.haveAccount} onPress={() => router.replace("/login")} />
      </AuthCard>
    </Guard>
  );
}

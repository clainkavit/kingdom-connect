import { useRouter } from "expo-router";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { GoogleButton } from "../src/components/first-sign-in";
import { returnedFromGoogleWithError, startGoogleSignIn } from "../src/lib/first-sign-in";
import { SignUpForm } from "../src/components/sign-up-form";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";
import { googleSignIn, loginClient, registrationClient } from "../src/lib/supabase";

export default function SignUpScreen() {
  const { startSession } = useAuth();
  const { t, platformName } = useLanguage();
  const router = useRouter();
  return (
    <Guard route="login">
      <AuthCard title={platformName ? t.signUpTitle(platformName) : t.createAccount}>
        <GoogleButton
          enabled={googleSignIn}
          onPress={startGoogleSignIn}
          returnedWithError={googleSignIn && returnedFromGoogleWithError()}
        />
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

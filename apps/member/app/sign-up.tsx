import { useRouter } from "expo-router";
import { Text, View } from "react-native";
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
      <AuthCard
        title={platformName ? t.signUpTitle(platformName) : t.createAccount}
        footer={
          <View className="flex-row flex-wrap items-center gap-1">
            <Text className="font-figtree text-sm text-ink-2">{t.haveAccount}</Text>
            <TextButton label={t.logIn} onPress={() => router.replace("/login")} />
          </View>
        }
      >
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
      </AuthCard>
    </Guard>
  );
}

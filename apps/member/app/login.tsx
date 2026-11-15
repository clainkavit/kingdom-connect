import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { GoogleButton } from "../src/components/first-sign-in";
import { returnedFromGoogleWithError, startGoogleSignIn } from "../src/lib/first-sign-in";
import { LoginForm } from "../src/components/login-forms";
import { Guard, useAuth } from "../src/lib/auth";
import { googleSignIn, loginClient } from "../src/lib/supabase";
import { useLanguage } from "../src/lib/language";

export default function LoginScreen() {
  const { startSession } = useAuth();
  const { t, platformName } = useLanguage();
  const router = useRouter();
  return (
    <Guard route="login">
      <AuthCard
        title={platformName ? t.loginTitle(platformName) : t.logIn}
        subtitle={t.loginSubtitle}
        footer={
          <>
            <View className="flex-row flex-wrap items-center gap-1">
              <Text className="font-figtree text-sm text-ink-2">{t.newHere}</Text>
              <TextButton label={t.createAccount} onPress={() => router.push("/sign-up")} />
            </View>
          </>
        }
      >
        <GoogleButton
          enabled={googleSignIn}
          onPress={startGoogleSignIn}
          returnedWithError={googleSignIn && returnedFromGoogleWithError()}
        />
        <LoginForm
          client={loginClient}
          onCodeSent={startSession}
          beforeSubmit={
            <TextButton
              end
              label={t.forgotPassword}
              onPress={() => router.push("/forgot-password")}
            />
          }
        />
      </AuthCard>
    </Guard>
  );
}

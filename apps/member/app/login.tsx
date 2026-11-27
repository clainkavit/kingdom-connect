import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { TextButton } from "../src/components/auth-card";
import { EntryCard } from "../src/components/entry-card";
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
      <EntryCard
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
        {googleSignIn ? (
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-line" />
              <Text className="font-figtree text-sm text-ink-2">{t.orDivider}</Text>
              <View className="h-px flex-1 bg-line" />
            </View>
            <GoogleButton
              enabled
              onPress={startGoogleSignIn}
              returnedWithError={returnedFromGoogleWithError()}
            />
          </View>
        ) : null}
      </EntryCard>
    </Guard>
  );
}

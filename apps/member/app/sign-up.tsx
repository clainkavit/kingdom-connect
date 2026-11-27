import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { TextButton } from "../src/components/auth-card";
import { EntryCard } from "../src/components/entry-card";
import { SignUpForm } from "../src/components/sign-up-form";
import { WelcomeChoices } from "../src/components/welcome-choices";
import { returnedFromGoogleWithError, startProviderSignIn } from "../src/lib/first-sign-in";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";
import {
  appleSignIn,
  facebookSignIn,
  googleSignIn,
  loginClient,
  phoneSignIn,
  registrationClient,
} from "../src/lib/supabase";

const providers = { google: googleSignIn, facebook: facebookSignIn, apple: appleSignIn };
const anyOtherWay = googleSignIn || facebookSignIn || appleSignIn || phoneSignIn;

/** S01 Welcome, then S02 sign-up with email. With only email switched on, the form shows at once. */
export default function SignUpScreen() {
  const { startSession } = useAuth();
  const { t, platformName } = useLanguage();
  const router = useRouter();
  const [withEmail, setWithEmail] = useState(!anyOtherWay);
  const footer = (
    <View className="flex-row flex-wrap items-center gap-1">
      <Text className="font-figtree text-sm text-ink-2">{t.haveAccount}</Text>
      <TextButton label={t.logIn} onPress={() => router.replace("/login")} />
    </View>
  );
  return (
    <Guard route="login">
      {withEmail ? (
        <EntryCard
          title={platformName ? t.signUpTitle(platformName) : t.createAccount}
          subtitle={t.signUpIntro}
          back={anyOtherWay ? { label: t.back, onPress: () => setWithEmail(false) } : undefined}
          footer={footer}
        >
          <SignUpForm
            registration={registrationClient}
            login={loginClient}
            onCodeSent={startSession}
          />
        </EntryCard>
      ) : (
        <EntryCard title={t.createAccount} subtitle={t.welcomeIntro} footer={footer}>
          <WelcomeChoices
            providers={providers}
            phone={phoneSignIn}
            returnedWithError={anyOtherWay && returnedFromGoogleWithError()}
            onProvider={startProviderSignIn}
            onPhone={() => router.push("/phone-sign-in")}
            onEmail={() => setWithEmail(true)}
          />
        </EntryCard>
      )}
    </Guard>
  );
}

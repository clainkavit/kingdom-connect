import { AuthCard, TextButton } from "../src/components/auth-card";
import { CodeForm } from "../src/components/login-forms";
import { Guard, useAuth } from "../src/lib/auth";
import { loginClient } from "../src/lib/supabase";
import { useLanguage } from "../src/lib/language";

export default function VerifyScreen() {
  const { accessToken, resendAfterSeconds, finishSignIn, signOut } = useAuth();
  const { t } = useLanguage();
  return (
    <Guard route="verify">
      <AuthCard title={t.codeTitle}>
        <CodeForm
          client={loginClient}
          accessToken={accessToken ?? ""}
          resendAfterSeconds={resendAfterSeconds}
          onVerified={finishSignIn}
        />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

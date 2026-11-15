import { AuthCard } from "../src/components/auth-card";
import { CodeForm } from "../src/components/login-forms";
import { Guard, useAuth } from "../src/lib/auth";
import { loginClient } from "../src/lib/supabase";
import { useLanguage } from "../src/lib/language";

export default function VerifyScreen() {
  const { accessToken, resendAfterSeconds, finishSignIn, signOut } = useAuth();
  const { t } = useLanguage();
  return (
    <Guard route="verify">
      <AuthCard title={t.codeTitle} back={{ label: t.backToLogIn, onPress: signOut }}>
        <CodeForm
          client={loginClient}
          accessToken={accessToken ?? ""}
          resendAfterSeconds={resendAfterSeconds}
          onVerified={finishSignIn}
        />
      </AuthCard>
    </Guard>
  );
}

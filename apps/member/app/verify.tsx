import { AuthCard, TextButton } from "../src/components/auth-card";
import { CodeForm } from "../src/components/login-forms";
import { Guard, useAuth } from "../src/lib/auth";
import { loginClient } from "../src/lib/supabase";
import { strings } from "../src/strings";

export default function VerifyScreen() {
  const { accessToken, resendAfterSeconds, finishSignIn, signOut } = useAuth();
  return (
    <Guard route="verify">
      <AuthCard title={strings.codeTitle}>
        <CodeForm
          client={loginClient}
          accessToken={accessToken ?? ""}
          resendAfterSeconds={resendAfterSeconds}
          onVerified={finishSignIn}
        />
        <TextButton label={strings.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

"use client";

import { AuthCard } from "@/components/auth-card";
import { CodeForm } from "@/components/login-forms";
import { useAuth } from "@/lib/auth";
import { loginClient } from "@/lib/supabase";
import { strings } from "@/strings";

export default function VerifyPage() {
  const { accessToken, resendAfterSeconds, finishSignIn, signOut } = useAuth();
  return (
    <AuthCard title={strings.codeTitle}>
      <CodeForm
        client={loginClient}
        accessToken={accessToken ?? ""}
        resendAfterSeconds={resendAfterSeconds}
        onVerified={finishSignIn}
      />
      <button
        type="button"
        onClick={signOut}
        className="self-start text-sm font-medium text-primary"
      >
        {strings.logOut}
      </button>
    </AuthCard>
  );
}

"use client";

import { AuthCard } from "@/components/auth-card";
import { CodeForm } from "@/components/login-forms";
import { useAuth } from "@/lib/auth";
import { loginClient } from "@/lib/supabase";
import { useLanguage } from "@/lib/language";

export default function VerifyPage() {
  const { accessToken, resendAfterSeconds, finishSignIn, signOut } = useAuth();
  const { t } = useLanguage();
  return (
    <AuthCard title={t.codeTitle}>
      <CodeForm
        client={loginClient}
        accessToken={accessToken ?? ""}
        resendAfterSeconds={resendAfterSeconds}
        onVerified={finishSignIn}
      />
      <button
        type="button"
        onClick={signOut}
        className="min-h-[44px] self-start text-sm font-semibold text-primary"
      >
        {t.logOut}
      </button>
    </AuthCard>
  );
}

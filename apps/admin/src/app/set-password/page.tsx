"use client";

import { KeyRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AuthCard } from "@/components/auth-card";
import { SetPassword, type SetPasswordApi } from "@/components/set-password";
import { StaffNewPassword, type NewPasswordApi } from "@/components/staff-reset";
import { useLanguage } from "@/lib/language";
import { staffClient } from "@/lib/staff";
import { supabase } from "@/lib/supabase";

const api: SetPasswordApi = {
  verify: async (tokenHash) => {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    return !error;
  },
  setPassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return false;
    await supabase.auth.signOut();
    return true;
  },
};

export default function SetPasswordPage() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const reset = params.get("reset");
  const token = params.get("token");
  const resetApi = useMemo<NewPasswordApi | null>(
    () =>
      reset && token
        ? {
            check: () => staffClient.checkResetLink(reset, token),
            save: (password) => staffClient.finishReset(reset, token, password),
          }
        : null,
    [reset, token],
  );
  if (resetApi)
    return (
      <AuthCard title={t.staffNewPasswordTitle} subtitle={t.staffNewPasswordIntro} badge={KeyRound}>
        <StaffNewPassword api={resetApi} />
      </AuthCard>
    );
  return (
    <AuthCard title={t.setPasswordTitle}>
      <SetPassword api={api} tokenHash={params.get("token_hash")} />
    </AuthCard>
  );
}

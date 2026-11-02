"use client";

import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SetPassword, type SetPasswordApi } from "@/components/set-password";
import { useLanguage } from "@/lib/language";
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
  const tokenHash = useSearchParams().get("token_hash");
  return (
    <AuthCard title={t.setPasswordTitle}>
      <SetPassword api={api} tokenHash={tokenHash} />
    </AuthCard>
  );
}

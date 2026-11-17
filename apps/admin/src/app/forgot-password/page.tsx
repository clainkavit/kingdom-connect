"use client";

import { Check, KeyRound } from "lucide-react";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { StaffForgotForm, StaffForgotSent } from "@/components/staff-reset";
import { useLanguage } from "@/lib/language";
import { staffClient } from "@/lib/staff";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [sent, setSent] = useState(false);
  return sent ? (
    <AuthCard title={t.staffResetSentTitle} subtitle={t.staffResetSentIntro} badge={Check} center>
      <StaffForgotSent />
    </AuthCard>
  ) : (
    <AuthCard title={t.forgotTitle} subtitle={t.staffForgotIntro} badge={KeyRound}>
      <StaffForgotForm requestReset={staffClient.requestReset} onSent={() => setSent(true)} />
    </AuthCard>
  );
}

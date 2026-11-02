"use client";

import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-forms";
import { useAuth } from "@/lib/auth";
import { loginClient } from "@/lib/supabase";
import { useLanguage } from "@/lib/language";

export default function LoginPage() {
  const { startSession } = useAuth();
  const { t } = useLanguage();
  return (
    <AuthCard title={t.staffLoginTitle}>
      <LoginForm client={loginClient} onCodeSent={startSession} />
    </AuthCard>
  );
}

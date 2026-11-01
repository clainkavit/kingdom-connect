"use client";

import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-forms";
import { useAuth } from "@/lib/auth";
import { loginClient } from "@/lib/supabase";
import { strings } from "@/strings";

export default function LoginPage() {
  const { startSession } = useAuth();
  return (
    <AuthCard title={strings.loginTitle}>
      <LoginForm client={loginClient} onCodeSent={startSession} />
    </AuthCard>
  );
}

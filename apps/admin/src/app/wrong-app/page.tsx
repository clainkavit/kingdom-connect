"use client";

import { AuthCard } from "@/components/auth-card";
import { useAuth } from "@/lib/auth";
import { strings } from "@/strings";

export default function WrongAppPage() {
  const { signOut } = useAuth();
  return (
    <AuthCard title={strings.appName}>
      <p className="text-sm leading-[1.45] text-ink-2">{strings.wrongApp}</p>
      <button
        type="button"
        onClick={signOut}
        className="min-h-[44px] self-start text-sm font-semibold text-primary"
      >
        {strings.logOut}
      </button>
    </AuthCard>
  );
}

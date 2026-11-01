"use client";

import { AuthCard } from "@/components/auth-card";
import { useAuth } from "@/lib/auth";
import { strings } from "@/strings";

export default function WrongAppPage() {
  const { signOut } = useAuth();
  return (
    <AuthCard title={strings.appName}>
      <p className="text-sm text-muted-foreground">{strings.wrongApp}</p>
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

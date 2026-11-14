"use client";

import { AuthCard } from "@/components/auth-card";
import { MemberAppLink } from "@/components/member-app-link";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

export default function WrongAppPage() {
  const { signOut } = useAuth();
  const { t, platformName } = useLanguage();
  return (
    <AuthCard title={platformName}>
      <p className="text-sm leading-[1.45] text-ink-2">{t.wrongAppStaff}</p>
      <MemberAppLink />
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

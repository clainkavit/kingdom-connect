"use client";

import { LanguageSwitch } from "@/components/language-switch";
import { LogOutButton } from "@/components/log-out-button";
import { MoreList, ScreenTitle } from "@/components/screens";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

export default function MorePage() {
  const { t } = useLanguage();
  const { superAdmin } = useAuth();
  return (
    <>
      <ScreenTitle>{t.tabMore}</ScreenTitle>
      <MoreList superAdmin={superAdmin} />
      <div className="mt-4 flex items-center justify-between rounded-lg border bg-card px-4">
        <span className="text-[15px] text-foreground">{t.language}</span>
        <LanguageSwitch />
      </div>
      <LogOutButton />
    </>
  );
}

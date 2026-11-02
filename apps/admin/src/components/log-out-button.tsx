"use client";

import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

export function LogOutButton() {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={signOut}
      className="mt-4 min-h-[44px] text-sm font-semibold text-primary"
    >
      {t.logOut}
    </button>
  );
}

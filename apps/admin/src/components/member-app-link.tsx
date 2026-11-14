"use client";

import { useLanguage } from "@/lib/language";
import { memberUrl } from "@/lib/supabase";

/** "Not staff? Go to the member app" under the staff log-in. The two apps stay separate. */
export function MemberAppLink({ base = memberUrl }: { base?: string }) {
  const { t } = useLanguage();
  if (!base) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
      <span>{t.notStaff}</span>
      <a
        href={`${base.replace(/\/+$/, "")}/login`}
        className="inline-flex min-h-[44px] items-center font-semibold text-primary underline-offset-2 hover:underline"
      >
        {t.goToMemberApp}
      </a>
    </p>
  );
}

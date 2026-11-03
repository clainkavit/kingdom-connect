"use client";

import { useLanguage } from "@/lib/language";
import { ScreenTitle } from "./screens";
import { EmptyState } from "./states";

/** A04: the moderation queue. Opportunities, ideas, training and events fill it from Release 2. */
export function ModerationQueue() {
  const { t } = useLanguage();
  return (
    <>
      <ScreenTitle>{t.adminNavModeration}</ScreenTitle>
      <EmptyState title={t.moderationEmptyTitle} message={t.moderationEmptyMessage} />
    </>
  );
}

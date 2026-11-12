import type { Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { PeopleYouMayKnowApi, SuggestionReason } from "../lib/people-you-may-know";
import { PersonRow } from "./connections";
import { useLoad } from "./events";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const SHOWN = 6;

export function suggestionReason(t: Strings, r: SuggestionReason): string {
  switch (r.code) {
    case "mutual":
      return t.pymkMutual(r.count);
    case "skills":
      return t.pymkSkills(r.skills.join(", "));
    case "location":
      return r.kind === "district" ? t.pymkDistrict : t.pymkRegion;
    case "profession":
      return t.pymkProfession;
    case "study":
      return t.pymkStudy;
    case "newest_in_region":
      return t.pymkNewest;
  }
}

/** S08: People you may know (O08), with why, and a way to their profile to connect. */
export function PeopleYouMayKnow({ api }: { api: PeopleYouMayKnowApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.list(SHOWN), attempt);
  return (
    <Section title={t.pymkTitle}>
      {loaded.state === "failed" ? (
        <ErrorState message={t.widgetLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={2} />
      ) : loaded.value.length === 0 ? (
        <EmptyState
          title={t.pymkEmpty}
          message={t.pymkEmptyHint}
          action={{ label: t.pymkCompleteProfile, href: "/profile/edit" }}
        />
      ) : (
        loaded.value.map((s) => (
          <PersonRow key={s.memberId} person={{ ...s, headline: s.headline ?? s.profession ?? "" }}>
            {s.reasons.length ? (
              <Text className="font-figtree-semibold text-[13px] text-good-text">
                {s.reasons.map((r) => suggestionReason(t, r)).join(" · ")}
              </Text>
            ) : null}
            <View className="items-start">
              <LinkButton
                href={`/profile/${s.memberId}`}
                label={t.pymkConnect(s.fullName)}
                className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
              >
                <Text className="font-figtree-semibold text-sm text-ink">{t.pymkConnectShort}</Text>
              </LinkButton>
            </View>
          </PersonRow>
        ))
      )}
    </Section>
  );
}

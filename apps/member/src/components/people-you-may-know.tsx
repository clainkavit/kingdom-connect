import type { Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { PeopleYouMayKnowApi, SuggestionReason } from "../lib/people-you-may-know";
import UserPlus from "lucide-react-native/icons/user-plus";
import { usePalette } from "./palette";
import { Avatar } from "./profile";
import { usePhone } from "./sheet";
import { useLoad } from "./events";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const SHOWN = 4;

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
  const palette = usePalette();
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.list(SHOWN), attempt);
  return (
    <Section title={t.pymkTitle} action={{ label: t.homeSeeAll, href: "/people" }}>
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
        <View className={phone ? "gap-3" : "flex-row flex-wrap gap-3"}>
          {loaded.value.map((s) => (
            <View
              key={s.memberId}
              className={`gap-2.5 rounded-[18px] border border-line bg-surface p-4 ${phone ? "" : "min-w-[220px] flex-1"}`}
            >
              <View className="flex-row items-center gap-3">
                <Avatar name={s.fullName} url={s.photoUrl} size={40} />
                <View className="min-w-0 flex-1">
                  <LinkButton
                    href={`/profile/${s.memberId}`}
                    label={s.fullName}
                    className="self-start"
                  >
                    <Text className="font-figtree-bold text-[15px] text-navy underline">
                      {s.fullName}
                    </Text>
                  </LinkButton>
                  {(s.headline ?? s.profession) ? (
                    <Text numberOfLines={1} className="font-figtree text-[13px] text-ink-2">
                      {s.headline ?? s.profession}
                    </Text>
                  ) : null}
                </View>
              </View>
              {s.reasons.length ? (
                <View className="flex-row items-center gap-1.5">
                  <UserPlus size={13} color={palette.ink2} aria-hidden />
                  <Text numberOfLines={1} className="flex-1 font-figtree text-[13px] text-ink">
                    {s.reasons.map((r) => suggestionReason(t, r)).join(" · ")}
                  </Text>
                </View>
              ) : null}
              <LinkButton
                href={`/profile/${s.memberId}`}
                label={t.pymkConnect(s.fullName)}
                className="min-h-[40px] flex-row items-center justify-center gap-1.5 rounded-full border border-line-2 bg-surface px-4"
              >
                <UserPlus size={15} color={palette.navy} aria-hidden />
                <Text className="font-figtree-semibold text-[14px] text-navy">
                  {t.pymkConnectShort}
                </Text>
              </LinkButton>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

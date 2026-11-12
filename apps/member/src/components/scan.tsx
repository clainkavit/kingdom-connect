import type { Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { MissingField, ScanApi, ScanReason } from "../lib/scan";
import { useLoad } from "./events";
import { Message } from "./form";
import { LinkButton } from "./link-button";
import { OpportunityCardView } from "./opportunities";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

export function reasonText(t: Strings, r: ScanReason): string {
  if (r.code === "skills") return t.scanReasonSkills(r.skills.join(", "));
  if (r.code === "sector") return t.scanReasonSector;
  if (r.code === "study") return t.scanReasonStudy;
  return { district: t.scanReasonDistrict, region: t.scanReasonRegion, remote: t.scanReasonRemote }[
    r.kind
  ];
}

const missingText = (t: Strings, f: MissingField) =>
  ({
    skills: t.scanMissingSkills,
    location: t.scanMissingLocation,
    profession: t.scanMissingProfession,
  })[f];

const listOf = (t: Strings, items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${t.scanAnd} ${items.at(-1)}`;

/** S16: Scan for Opportunities, up to 20 matches with their top two reasons (O07). */
export function ScanScreen({ api }: { api: ScanApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const [matches, missing] = await Promise.all([api.matches(), api.missing()]);
    return { matches, missing };
  }, attempt);

  return (
    <View className="gap-3">
      <LinkButton href="/opportunities" label={t.oppBack} className="min-h-[40px] justify-center">
        <Text className="font-figtree-semibold text-sm text-blue">{t.oppBack}</Text>
      </LinkButton>
      <ScreenTitle>{t.scanTitle}</ScreenTitle>
      <Text className="font-figtree text-[14px] leading-5 text-ink-2">{t.scanIntro}</Text>
      {loaded.state === "failed" ? (
        <ErrorState message={t.scanLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : (
        <>
          {loaded.value.missing.length ? (
            <View className="gap-2">
              <Message
                tone="info"
                text={t.scanMissing(
                  listOf(
                    t,
                    loaded.value.missing.map((f) => missingText(t, f)),
                  ),
                )}
              />
              <LinkButton
                href="/profile/edit"
                label={t.scanCompleteProfile}
                className="min-h-[44px] justify-center self-start"
              >
                <Text className="font-figtree-semibold text-sm text-blue">
                  {t.scanCompleteProfile}
                </Text>
              </LinkButton>
            </View>
          ) : null}
          {loaded.value.matches.length === 0 ? (
            loaded.value.missing.length ? (
              <EmptyState
                title={t.scanEmptyProfile}
                message={t.scanEmptyProfileHint}
                action={{ label: t.scanCompleteProfile, href: "/profile/edit" }}
              />
            ) : (
              <EmptyState
                title={t.scanEmpty}
                message={t.scanEmptyHint}
                action={{ label: t.navOpportunities, href: "/opportunities" }}
              />
            )
          ) : (
            loaded.value.matches.map((m) => (
              <View key={m.id} className="gap-1.5">
                <OpportunityCardView post={m} />
                {m.reasons.length ? (
                  <Text className="px-1 font-figtree-semibold text-[13px] text-good-text">
                    {m.reasons.map((r) => reasonText(t, r)).join(" · ")}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

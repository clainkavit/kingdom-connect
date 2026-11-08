import type { Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import type { IdeaAccessApi } from "../lib/idea-access";
import { POOL_PAGE, type IdeaSummary, type IdeasApi } from "../lib/ideas";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button } from "./form";
import { AccessManager, IdeaInterest } from "./idea-access";
import { seekingLabel, stageLabel } from "./ideas";
import { LinkButton } from "./link-button";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const shillings = (n: number) => n.toLocaleString("en-US");

export function rangeLine(t: Strings, idea: IdeaSummary): string | null {
  const { investmentMin: min, investmentMax: max } = idea;
  if (min !== null && max !== null) return t.ideaRangeBoth(shillings(min), shillings(max));
  if (min !== null) return t.ideaRangeFrom(shillings(min));
  if (max !== null) return t.ideaRangeUpTo(shillings(max));
  return null;
}

function IdeaCard({ idea }: { idea: IdeaSummary }) {
  const { t, language } = useLanguage();
  const facts = [
    language === "sw" ? idea.sectorSw : idea.sectorEn,
    stageLabel(t, idea.stage),
    seekingLabel(t, idea.seeking),
    rangeLine(t, idea),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <LinkButton
      href={`/ideas/${idea.id}`}
      label={idea.title}
      className="gap-1 rounded-card border border-line bg-surface p-4"
    >
      <Text className="font-figtree-bold text-[16px] text-ink">{idea.title}</Text>
      <Text numberOfLines={2} className="font-figtree text-[14px] text-ink">
        {idea.problem}
      </Text>
      <Text className="font-figtree text-[13px] text-ink-2">{facts}</Text>
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {idea.isMine ? t.ideaYours : (idea.ownerName ?? t.ideaVerifiedMember)} ·{" "}
        {t.ideaInterested(idea.interestCount)}
      </Text>
    </LinkButton>
  );
}

/** S22: the ideas pool, newest first, 20 at a time. Investor filters and Saved arrive with I06. */
export function IdeasPool({ api }: { api: IdeasApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const first = useLoad(() => api.pool(0), attempt);
  const [more, setMore] = useState<IdeaSummary[]>([]);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const loadMore = async () => {
    setBusy(true);
    setMoreFailed(false);
    try {
      const next = await api.pool(page);
      setMore((m) => [...m, ...next]);
      setPage((p) => p + 1);
      if (next.length < POOL_PAGE) setDone(true);
    } catch {
      setMoreFailed(true);
    }
    setBusy(false);
  };

  return (
    <View className="gap-3">
      <ScreenTitle>{t.navIdeas}</ScreenTitle>
      <View className="flex-row flex-wrap gap-2">
        <LinkButton
          href="/ideas/new"
          label={t.ideasShare}
          className="min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4"
        >
          <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.ideasShare}</Text>
        </LinkButton>
        <LinkButton
          href="/ideas/mine"
          label={t.ideasMine}
          className="min-h-[48px] items-center justify-center rounded-[10px] border border-line bg-surface px-4"
        >
          <Text className="font-figtree-semibold text-[15px] text-ink">{t.ideasMine}</Text>
        </LinkButton>
      </View>
      {first.state === "failed" ? (
        <ErrorState message={t.ideasPoolLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : first.state === "loading" ? (
        <LoadingRows />
      ) : first.value.length === 0 ? (
        <EmptyState
          title={t.ideasPoolEmptyTitle}
          message={t.ideasPoolEmptyMessage}
          action={{ label: t.ideasShare, href: "/ideas/new" }}
        />
      ) : (
        <>
          {[...first.value, ...more].map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
          {moreFailed ? (
            <ErrorState message={t.ideasPoolLoadFailed} onRetry={loadMore} />
          ) : !done && first.value.length === POOL_PAGE ? (
            <Button secondary label={t.loadMore} disabled={busy} onPress={loadMore} />
          ) : null}
        </>
      )}
    </View>
  );
}

/** S23: one idea's summary. The details stay locked; members ask for access and the owner manages it (I03). */
export function IdeaSummaryScreen({
  api,
  access,
  ideaId,
}: {
  api: IdeasApi;
  access: IdeaAccessApi;
  ideaId: string;
}) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.summary(ideaId), attempt);

  if (loaded.state === "failed") {
    return <ErrorState message={t.ideasPoolLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  const idea = loaded.value;
  if (!idea) {
    return (
      <EmptyState
        title={t.ideaNotFound}
        message=""
        action={{ label: t.ideaBackToPool, href: "/ideas" }}
      />
    );
  }
  const facts: [string, string | null][] = [
    [t.ideaSectorLabel, language === "sw" ? idea.sectorSw : idea.sectorEn],
    [t.ideaStageLabel, stageLabel(t, idea.stage)],
    [t.ideaSeekingLabel, seekingLabel(t, idea.seeking)],
    [t.ideaInvestmentLabel, rangeLine(t, idea)],
  ];

  return (
    <View className="gap-4">
      <ScreenTitle>{idea.title}</ScreenTitle>
      <Text className="font-figtree text-[15px] leading-6 text-ink">{idea.problem}</Text>
      <View className="gap-2 rounded-card border border-line bg-surface p-4">
        {facts.map(([label, value]) =>
          value ? (
            <View key={label} className="gap-0.5">
              <Text className="font-figtree text-[13px] text-ink-2">{label}</Text>
              <Text className="font-figtree-semibold text-[15px] text-ink">{value}</Text>
            </View>
          ) : null,
        )}
        <Text className="font-figtree text-[13px] text-ink-2">
          {t.ideaInterested(idea.interestCount)}
        </Text>
      </View>
      {idea.isMine ? (
        <>
          <AccessManager api={access} ideaId={idea.id} />
          <LinkButton
            href="/ideas/mine"
            label={t.ideaManageMine}
            className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-sm text-ink-2">{t.ideaManageMine}</Text>
          </LinkButton>
        </>
      ) : (
        <>
          {idea.ownerId ? (
            <LinkButton
              href={`/profile/${idea.ownerId}`}
              label={idea.ownerName ?? ""}
              className="min-h-[44px] justify-center"
            >
              <Text className="font-figtree-semibold text-[15px] text-blue">{idea.ownerName}</Text>
            </LinkButton>
          ) : (
            <Text className="font-figtree-semibold text-[15px] text-ink">
              {t.ideaVerifiedMember}
            </Text>
          )}
          <Text className="font-figtree text-sm text-ink-2">{t.ideaLockedDetails}</Text>
          <IdeaInterest api={access} ideaId={idea.id} />
        </>
      )}
    </View>
  );
}

/** S11: the Ideas section of a profile: that member's published ideas shared with their name. */
export function ProfileIdeas({ api, memberId }: { api: IdeasApi; memberId: string }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.byOwner(memberId), attempt);
  if (loaded.state === "failed") {
    return <ErrorState message={t.ideasPoolLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows rows={1} />;
  if (loaded.value.length === 0) {
    return <Text className="font-figtree text-sm text-ink-2">{t.profileNoIdeas}</Text>;
  }
  return (
    <View className="gap-2">
      {loaded.value.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} />
      ))}
    </View>
  );
}

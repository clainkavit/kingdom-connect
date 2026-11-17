import type { Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import type { IdeaAccessApi } from "../lib/idea-access";
import { POOL_PAGE, type IdeaSummary, type IdeasApi } from "../lib/ideas";
import type { InvestorApi } from "../lib/investor";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button, Chips } from "./form";
import { AccessManager, DetailsLink, IdeaInterest } from "./idea-access";
import { InvestorPool } from "./investor";
import { seekingLabel, stageLabel } from "./ideas";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import Lock from "lucide-react-native/icons/lock";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Star from "lucide-react-native/icons/star";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { Avatar } from "./profile";
import { ScreenTitle } from "./screens";
import { usePhone } from "./sheet";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const shillings = (n: number) => n.toLocaleString("en-US");

export function rangeLine(t: Strings, idea: IdeaSummary): string | null {
  const { investmentMin: min, investmentMax: max } = idea;
  if (min !== null && max !== null) return t.ideaRangeBoth(shillings(min), shillings(max));
  if (min !== null) return t.ideaRangeFrom(shillings(min));
  if (max !== null) return t.ideaRangeUpTo(shillings(max));
  return null;
}

function CardChip({ text }: { text: string }) {
  return (
    <View className="rounded-full bg-blue-soft px-2.5 py-0.5">
      <Text className="font-figtree-bold text-xs text-navy">{text}</Text>
    </View>
  );
}

/** An idea card as on the canvas (U04): sector and stage chips, the problem, what it looks for, owner and interest. */
const millions = (n: number) => {
  const m = n / 1_000_000;
  return Number.isInteger(m) ? `${m}` : m.toFixed(1);
};

/** The canvas range chip: "TZS 10–50M", "Under TZS 10M", "Over TZS 50M". */
export function shortRange(t: Strings, idea: IdeaSummary): string | null {
  const { investmentMin: min, investmentMax: max } = idea;
  if (min !== null && max !== null) return t.ideaShortBoth(millions(min), millions(max));
  if (min !== null) return t.ideaShortFrom(millions(min));
  if (max !== null) return t.ideaShortUpTo(millions(max));
  return null;
}

const stageTone: Record<IdeaSummary["stage"], string> = {
  idea: "bg-blue-soft text-navy",
  prototype: "bg-violet-soft text-violet",
  early_revenue: "bg-teal-soft text-teal",
  growing: "bg-good-soft text-good-text",
};

function ToneChip({ text, tone }: { text: string; tone: string }) {
  const [bg, fg] = tone.split(" ");
  return (
    <View className={`rounded-full px-2.5 py-1 ${bg}`}>
      <Text className={`font-figtree-bold text-[12px] ${fg}`}>{text}</Text>
    </View>
  );
}

/** An idea card as on the canvas (U04, V07): chips, title, problem, what it looks for, owner and interest. */
export function IdeaCard({ idea, children }: { idea: IdeaSummary; children?: React.ReactNode }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const range = shortRange(t, idea);
  const owner = idea.isMine ? t.ideaYours : (idea.ownerName ?? t.ideaVerifiedMember);
  const card = (
    <LinkButton
      href={`/ideas/${idea.id}`}
      label={idea.title}
      className="flex-1 gap-2.5 rounded-card border border-line bg-surface px-[18px] py-[18px]"
    >
      <View className="flex-row flex-wrap gap-1.5">
        <ToneChip
          text={language === "sw" ? idea.sectorSw : idea.sectorEn}
          tone="bg-blue-soft text-navy"
        />
        <ToneChip text={stageLabel(t, idea.stage)} tone={stageTone[idea.stage]} />
      </View>
      <Text className="font-figtree-bold text-[17px] text-ink">{idea.title}</Text>
      <Text numberOfLines={2} className="font-figtree text-[14px] leading-[21px] text-ink-2">
        {idea.problem}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        <ToneChip text={t.ideaLookingForShort(idea.seeking)} tone="bg-surface-2 text-ink" />
        {range ? <ToneChip text={range} tone="bg-warn-soft text-warn-text" /> : null}
      </View>
      <View className="mt-auto flex-row items-center justify-between gap-2 border-t border-line pt-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {idea.ownerName || idea.isMine ? (
            <Avatar name={idea.ownerName ?? owner} url={null} size={28} />
          ) : (
            <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-2">
              <ShieldCheck size={14} color={palette.ink2} aria-hidden />
            </View>
          )}
          <Text
            numberOfLines={1}
            className={`flex-1 text-[13px] ${idea.isMine ? "font-figtree-semibold text-ink" : "font-figtree text-ink"}`}
          >
            {owner}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Star size={14} color={palette.ink} aria-hidden />
          <Text className="font-figtree-bold text-[13px] text-ink">
            {t.ideaInterested(idea.interestCount)}
          </Text>
        </View>
      </View>
    </LinkButton>
  );
  if (!children) return card;
  return (
    <View className="gap-2">
      {card}
      {children}
    </View>
  );
}

/** S22: the ideas pool, newest first, 20 at a time. A flag holder gets the investor pool instead (I06). */
export function IdeasPool({ api, investor }: { api: IdeasApi; investor: InvestorApi }) {
  const status = useLoad(() => investor.status().catch(() => "none" as const), 0);
  if (status.state === "loading") return <LoadingRows />;
  if (status.state === "ready" && status.value === "investor") {
    return <InvestorPool ideas={api} investor={investor} />;
  }
  return <MemberPool api={api} showApply={status.state === "ready" && status.value !== "none"} />;
}

type Looking = "all" | "partner" | "investor";

const looksFor = (idea: IdeaSummary, looking: Looking) =>
  looking === "all" || idea.seeking === looking || idea.seeking === "both";

function MemberPool({ api, showApply }: { api: IdeasApi; showApply: boolean }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [looking, setLooking] = useState<Looking>("all");
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
    <View className="gap-4">
      <View className="flex-row flex-wrap items-start justify-between gap-4">
        <View className="min-w-0 flex-1 basis-[420px] gap-1.5">
          <Text
            role="heading"
            aria-level={1}
            className={`font-figtree-extrabold text-navy ${phone ? "text-[24px] leading-[28px]" : "text-[32px] leading-[37px]"}`}
          >
            {t.navIdeas}
          </Text>
          <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
            {t.ideasPoolIntro}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <LinkButton
            href="/ideas/new"
            label={t.ideasShare}
            className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-navy px-5"
          >
            <Lightbulb size={18} color={palette.navyInk} aria-hidden />
            <Text className="font-figtree-semibold text-[15px] text-white">{t.ideasShare}</Text>
          </LinkButton>
          <LinkButton
            href="/ideas/mine"
            label={t.ideasMine}
            className="min-h-[48px] items-center justify-center rounded-full border border-line-2 bg-surface px-5"
          >
            <Text className="font-figtree-semibold text-[15px] text-navy">{t.ideasMine}</Text>
          </LinkButton>
          <LinkButton
            href="/plans"
            label={t.plansTitle}
            className="min-h-[48px] items-center justify-center rounded-full border border-line-2 bg-surface px-5"
          >
            <Text className="font-figtree-semibold text-[15px] text-navy">{t.plansTitle}</Text>
          </LinkButton>
        </View>
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
          <Chips
            hideLabel
            label={t.ideasShow}
            options={[
              { value: "all", label: t.ideasAll },
              { value: "partner", label: t.ideasLookingPartners },
              { value: "investor", label: t.ideasLookingInvestors },
            ]}
            value={looking}
            onChange={(v) => setLooking(v as Looking)}
          />
          <View className={phone ? "gap-3" : "flex-row flex-wrap gap-3"}>
            {[...first.value, ...more]
              .filter((idea) => looksFor(idea, looking))
              .map((idea) => (
                <View key={idea.id} className={phone ? "" : "w-[32%] min-w-[260px] flex-grow"}>
                  <IdeaCard idea={idea} />
                </View>
              ))}
          </View>
          {moreFailed ? (
            <ErrorState message={t.ideasPoolLoadFailed} onRetry={loadMore} />
          ) : !done && first.value.length === POOL_PAGE ? (
            <View className="items-center">
              <Button secondary label={t.loadMore} disabled={busy} onPress={loadMore} />
            </View>
          ) : null}
        </>
      )}
      {showApply ? (
        <LinkButton
          href="/ideas/investor"
          label={t.investorToolsLink}
          className="min-h-[44px] justify-center"
        >
          <Text className="font-figtree-semibold text-sm text-blue">{t.investorToolsLink}</Text>
        </LinkButton>
      ) : null}
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
  const palette = usePalette();
  const phone = usePhone();
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
    [t.ideaInvestmentLabel, shortRange(t, idea)],
  ];

  const owner = idea.isMine ? t.ideaYours : (idea.ownerName ?? t.ideaVerifiedMember);
  const side = idea.isMine ? (
    <View className="gap-4">
      <DetailsLink ideaId={idea.id} />
      <AccessManager api={access} ideaId={idea.id} />
      <LinkButton
        href="/ideas/mine"
        label={t.ideaManageMine}
        className="min-h-[44px] items-center justify-center rounded-full border border-line-2 bg-surface px-4"
      >
        <Text className="font-figtree-semibold text-sm text-navy">{t.ideaManageMine}</Text>
      </LinkButton>
    </View>
  ) : (
    <IdeaInterest api={access} ideaId={idea.id} />
  );

  if (idea.isMine)
    return (
      <View className="gap-5">
        <LinkButton
          href="/ideas"
          label={t.ideaBackToPool}
          className="min-h-[36px] flex-row items-center gap-1.5 self-start"
        >
          <ChevronLeft size={16} color={palette.navy} aria-hidden />
          <Text className="font-figtree-semibold text-[15px] text-navy underline">
            {t.ideaBackToPool}
          </Text>
        </LinkButton>
        <View className="flex-row flex-wrap items-end justify-between gap-4">
          <View className="min-w-0 flex-1 basis-[360px] gap-2">
            <View className="flex-row flex-wrap gap-1.5">
              <ToneChip text={t.ideaYours} tone="bg-warn-soft text-warn-text" />
              <ToneChip text={t.adminIdeaStatusPublished} tone="bg-good-soft text-good-text" />
              <ToneChip text={stageLabel(t, idea.stage)} tone={stageTone[idea.stage]} />
            </View>
            <Text
              role="heading"
              aria-level={1}
              className={`font-figtree-extrabold text-navy ${phone ? "text-[24px] leading-[28px]" : "text-[32px] leading-[37px]"}`}
            >
              {idea.title}
            </Text>
            <Text className="font-figtree text-[15px] text-ink-2">
              {idea.ownerName ? t.ideaSharedWithName : t.ideaSharedWithoutName}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2.5">
            <LinkButton
              href={`/ideas/${idea.id}/details`}
              label={t.ideaOpenDetails}
              className="min-h-[46px] items-center justify-center rounded-full border border-line-2 bg-surface px-5"
            >
              <Text className="font-figtree-semibold text-[15px] text-ink">
                {t.ideaOpenDetails}
              </Text>
            </LinkButton>
            <LinkButton
              href="/ideas/mine"
              label={t.ideaManageMine}
              className="min-h-[46px] items-center justify-center rounded-full border border-line-2 bg-surface px-5"
            >
              <Text className="font-figtree-semibold text-[15px] text-ink">{t.ideaManageMine}</Text>
            </LinkButton>
          </View>
        </View>
        <AccessManager api={access} ideaId={idea.id} />
      </View>
    );

  return (
    <View className="gap-4">
      <LinkButton
        href="/ideas"
        label={t.ideaBackToPool}
        className="min-h-[36px] flex-row items-center gap-1.5 self-start"
      >
        <ChevronLeft size={16} color={palette.navy} aria-hidden />
        <Text className="font-figtree-semibold text-[15px] text-navy underline">
          {t.ideaBackToPool}
        </Text>
      </LinkButton>
      <View className={phone ? "gap-4" : "flex-row items-start gap-4"}>
        <View className="min-w-0 flex-1 gap-4">
          <View className="gap-3 rounded-card border border-line bg-surface px-6 py-6">
            <View className="flex-row flex-wrap gap-1.5">
              <ToneChip
                text={language === "sw" ? idea.sectorSw : idea.sectorEn}
                tone="bg-blue-soft text-navy"
              />
              <ToneChip text={stageLabel(t, idea.stage)} tone={stageTone[idea.stage]} />
            </View>
            <Text
              role="heading"
              aria-level={1}
              className={`font-figtree-extrabold text-navy ${phone ? "text-[24px] leading-[28px]" : "text-[32px] leading-[37px]"}`}
            >
              {idea.title}
            </Text>
            <Text className="font-figtree-bold text-[14px] text-ink-2">{t.ideaTheProblem}</Text>
            <Text className="font-figtree text-[16px] leading-[26px] text-ink">{idea.problem}</Text>
            <View className="flex-row flex-wrap gap-3">
              {facts.map(([label, value]) =>
                value ? (
                  <View
                    key={label}
                    className="min-w-[150px] flex-1 gap-0.5 rounded-[14px] bg-surface-2 px-3.5 py-3"
                  >
                    <Text className="font-figtree-bold text-[12px] text-ink">{label}</Text>
                    <Text className="font-figtree text-[15px] text-ink">{value}</Text>
                  </View>
                ) : null,
              )}
            </View>
            <View className="flex-row items-center justify-between gap-2 border-t border-line pt-3">
              {idea.ownerId && !idea.isMine ? (
                <LinkButton
                  href={`/profile/${idea.ownerId}`}
                  label={owner}
                  className="min-h-[36px] flex-row items-center gap-2"
                >
                  <Avatar name={owner} url={null} size={32} />
                  <Text className="font-figtree-semibold text-[14px] text-navy">{owner}</Text>
                </LinkButton>
              ) : (
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-2">
                    <ShieldCheck size={15} color={palette.ink2} aria-hidden />
                  </View>
                  <Text className="font-figtree text-[13px] text-ink">{owner}</Text>
                </View>
              )}
              <View className="flex-row items-center gap-1.5">
                <Star size={15} color={palette.ink} aria-hidden />
                <Text className="font-figtree-bold text-[14px] text-ink">
                  {t.ideaMembersInterested(idea.interestCount)}
                </Text>
              </View>
            </View>
          </View>
          {idea.isMine ? null : (
            <View className="gap-2 rounded-card border border-dashed border-line-2 bg-surface-2 px-6 py-5">
              <View className="flex-row items-center gap-2">
                <Lock size={16} color={palette.ink} aria-hidden />
                <Text
                  role="heading"
                  aria-level={2}
                  className="font-figtree-bold text-[18px] text-ink"
                >
                  {t.ideaDetailsLocked}
                </Text>
              </View>
              {[
                t.ideaLockedDescription,
                t.ideaLockedModel,
                t.ideaLockedMarket,
                t.ideaLockedFinancials,
                t.ideaLockedTeam,
                t.ideaLockedFiles,
              ].map((line) => (
                <View key={line} className="flex-row gap-2">
                  <Text className="font-figtree text-[15px] text-ink">•</Text>
                  <Text className="font-figtree text-[15px] text-ink">{line}</Text>
                </View>
              ))}
              <Text className="font-figtree text-[14px] text-ink">{t.ideaLockedDetails}</Text>
            </View>
          )}
        </View>
        <View className={phone ? "" : "w-[448px] max-w-full"}>{side}</View>
      </View>
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

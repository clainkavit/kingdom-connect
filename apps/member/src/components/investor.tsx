import { IDEA_STAGES, parseTzs, type IdeaStage, type Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import Bookmark from "lucide-react-native/icons/bookmark";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import Lock from "lucide-react-native/icons/lock";
import { Pressable, Text, View } from "react-native";
import type { IdeasApi } from "../lib/ideas";
import {
  type InvestorApi,
  type InvestorFocus,
  type InvestorFilters,
  NO_FILTERS,
  POOL_PAGE,
  type SavableIdea,
  type TicketBand,
} from "../lib/investor";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button, Chips, ChoiceList, Field, Message } from "./form";
import { stageLabel } from "./ideas";
import { IdeaCard } from "./ideas-pool";
import { LinkButton } from "./link-button";
import { PageHeader, ScreenTitle } from "./screens";
import { Donut } from "./donut";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const BANDS: TicketBand[] = ["under_10m", "10m_to_50m", "over_50m"];
const bandText = (t: Strings, band: TicketBand) =>
  ({
    under_10m: t.accessBandUnder10m,
    "10m_to_50m": t.accessBand10mTo50m,
    over_50m: t.accessBandOver50m,
  })[band];

function SaveButton({ idea, investor }: { idea: SavableIdea; investor: InvestorApi }) {
  const { t } = useLanguage();
  const [saved, setSaved] = useState(idea.saved);
  const [busy, setBusy] = useState(false);
  const palette = usePalette();
  return (
    <Pressable
      role="button"
      aria-label={saved ? t.investorUnsave : t.investorSave}
      aria-disabled={busy}
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        const result = await investor.setSaved(idea.id, !saved).catch(() => "error");
        setBusy(false);
        if (result === "ok") setSaved(!saved);
      }}
      className={`h-11 w-11 items-center justify-center rounded-full border ${saved ? "border-navy bg-warn-soft" : "border-line-2 bg-surface"}`}
    >
      <Bookmark
        size={18}
        color={palette.navy}
        fill={saved ? palette.navy : "transparent"}
        aria-hidden
      />
    </Pressable>
  );
}

/** A page of the investor pool, with Load more. */
function InvestorList({
  investor,
  filters,
  savedOnly,
  withSide = false,
  focus = null,
}: {
  investor: InvestorApi;
  filters: InvestorFilters;
  savedOnly: boolean;
  withSide?: boolean;
  focus?: InvestorFocus | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const first = useLoad(() => investor.pool(filters, savedOnly, 0), attempt);
  const [more, setMore] = useState<SavableIdea[]>([]);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (first.state === "failed") {
    return <ErrorState message={t.ideasPoolLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (first.state === "loading") return <LoadingRows />;
  if (first.value.length === 0) {
    return savedOnly ? (
      <EmptyState
        title={t.investorSavedEmpty}
        message=""
        action={{ label: t.navIdeas, href: "/ideas" }}
      />
    ) : (
      <EmptyState title={t.investorNoMatch} message={t.investorNoMatchHint} />
    );
  }
  const all = [...first.value, ...more];
  const stageColors = [palette.crimson, palette.goldDeep, palette.teal, palette.violet];
  const cards = (
    <View className={phone ? "gap-3" : "flex-row flex-wrap gap-3"}>
      {all.map((idea) => (
        <View key={idea.id} className={phone ? "" : "w-[48%] min-w-[260px] flex-grow"}>
          <IdeaCard
            idea={idea}
            matchesFocus={Boolean(focus?.sectorEn) && idea.sectorEn === focus?.sectorEn}
          >
            {idea.isMine ? null : <SaveButton idea={idea} investor={investor} />}
          </IdeaCard>
        </View>
      ))}
    </View>
  );
  const side =
    withSide && !phone ? (
      <View className="w-[300px] gap-3">
        <MyRequests investor={investor} />
        <View className="gap-3 rounded-card border border-line bg-surface px-5 py-5">
          <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
            {t.investorByStage}
          </Text>
          <Donut
            unit={t.investorMatching}
            parts={IDEA_STAGES.map((stage, i) => ({
              label: stageLabel(t, stage),
              value: all.filter((idea) => idea.stage === stage).length,
              color: stageColors[i]!,
            }))}
          />
        </View>
        <Text className="font-figtree text-[13px] leading-5 text-ink-2">
          {t.investorSilentNote}
        </Text>
      </View>
    ) : null;
  return (
    <>
      {side ? (
        <View className="flex-row items-start gap-4">
          <View className="min-w-0 flex-1">{cards}</View>
          {side}
        </View>
      ) : (
        cards
      )}
      {!done && first.value.length === POOL_PAGE ? (
        <Button
          secondary
          label={t.loadMore}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            const next = await investor.pool(filters, savedOnly, page).catch(() => []);
            setMore((m) => [...m, ...next]);
            setPage((p) => p + 1);
            if (next.length < POOL_PAGE) setDone(true);
            setBusy(false);
          }}
        />
      ) : null}
    </>
  );
}

/** S22 for a flag holder: filters by sector, stage, range and region, Save, and a link to Saved. */
export function InvestorPool({ ideas, investor }: { ideas: IdeasApi; investor: InvestorApi }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const options = useLoad(
    async () => ({
      sectors: await ideas.sectors(language),
      regions: await investor.regions(language),
    }),
    0,
  );
  const focus = useLoad(() => investor.focus().catch(() => null), 0);
  const [draft, setDraft] = useState({ sectorId: "", stage: "", min: "", max: "", regionId: "" });
  const [filters, setFilters] = useState<InvestorFilters>(NO_FILTERS);
  const [filtersOpen, setShowFilters] = useState<boolean | null>(null);
  const showFilters = filtersOpen ?? !phone;
  const [problem, setProblem] = useState<string | null>(null);

  const apply = () => {
    const min = draft.min ? parseTzs(draft.min) : null;
    const max = draft.max ? parseTzs(draft.max) : null;
    if (
      (draft.min && min === null) ||
      (draft.max && max === null) ||
      (min !== null && max !== null && min > max)
    ) {
      return setProblem(t.ideaProblemRange);
    }
    setProblem(null);
    setFilters({
      sectorId: draft.sectorId || null,
      stage: (draft.stage || null) as IdeaStage | null,
      min,
      max,
      regionId: draft.regionId || null,
    });
  };

  const tab = (href: string, label: string) => (
    <LinkButton
      key={href}
      href={href}
      label={label}
      className="min-h-[40px] items-center justify-center rounded-full px-4"
    >
      <Text className="font-figtree-semibold text-[14px] text-ink">{label}</Text>
    </LinkButton>
  );
  const fields =
    options.state === "ready" ? (
      <View className="gap-3">
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-[200px] flex-1">
            <ChoiceList
              label={t.ideaSectorLabel}
              options={options.value.sectors}
              value={draft.sectorId || undefined}
              onChange={(sectorId) => setDraft({ ...draft, sectorId })}
            />
          </View>
          <View className="min-w-[160px] flex-1">
            <Field
              label={t.investorMinLabel}
              value={draft.min}
              keyboardType="number-pad"
              onChange={(min) => setDraft({ ...draft, min })}
            />
          </View>
          <View className="min-w-[160px] flex-1">
            <Field
              label={t.investorMaxLabel}
              value={draft.max}
              keyboardType="number-pad"
              onChange={(max) => setDraft({ ...draft, max })}
            />
          </View>
          <View className="min-w-[200px] flex-1">
            <ChoiceList
              label={t.investorRegionLabel}
              options={options.value.regions}
              value={draft.regionId || undefined}
              onChange={(regionId) => setDraft({ ...draft, regionId })}
            />
          </View>
        </View>
        <Chips<IdeaStage>
          label={t.ideaStageLabel}
          options={IDEA_STAGES.map((s) => ({ value: s, label: stageLabel(t, s) }))}
          value={(draft.stage || undefined) as IdeaStage | undefined}
          onChange={(stage) => setDraft({ ...draft, stage })}
        />
        <Message text={problem} />
        <View className="flex-row flex-wrap gap-2">
          <Button label={t.investorApplyFilters} onPress={apply} />
          <Button
            secondary
            label={t.investorClearFilters}
            onPress={() => {
              setDraft({ sectorId: "", stage: "", min: "", max: "", regionId: "" });
              setProblem(null);
              setFilters(NO_FILTERS);
            }}
          />
        </View>
      </View>
    ) : null;

  return (
    <View className="w-full max-w-[1200px] gap-5 self-center">
      <PageHeader title={t.navIdeas} subtitle={t.investorPoolIntro}>
        <LinkButton
          href="/ideas/new"
          label={t.ideasShare}
          className="min-h-[44px] flex-row items-center gap-2 rounded-full border border-line-2 bg-surface px-4"
        >
          <Lightbulb size={16} color={palette.navy} aria-hidden />
          <Text className="font-figtree-semibold text-[15px] text-ink">{t.ideasShare}</Text>
        </LinkButton>
      </PageHeader>
      <View className="gap-3 rounded-card bg-navy px-5 py-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2.5">
            <Text className="font-figtree-bold text-[16px] text-white">{t.investorToolsTitle}</Text>
            <View className="flex-row items-center gap-1 rounded-full bg-navy-2 px-2.5 py-1">
              <Lock size={12} color={palette.navyInk} aria-hidden />
              <Text className="font-figtree-bold text-[12px] text-navy-ink">
                {t.investorOnlyYou}
              </Text>
            </View>
          </View>
          {focus.state === "ready" && focus.value ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-figtree text-[13px] text-navy-ink">{t.investorYourFocus}</Text>
              {[
                (language === "sw" ? focus.value.sectorSw : focus.value.sectorEn) ?? null,
                focus.value.band ? bandText(t, focus.value.band) : null,
              ]
                .filter((x): x is string => Boolean(x))
                .map((chip, i) => (
                  <Text
                    key={chip}
                    className={`rounded-full px-2.5 py-1 font-figtree-bold text-[12px] ${i === 0 ? "bg-surface text-navy" : "bg-gold text-gold-ink"}`}
                  >
                    {chip}
                  </Text>
                ))}
            </View>
          ) : null}
          <Pressable
            role="button"
            aria-label={showFilters ? t.investorHideFilters : t.investorFilters}
            onPress={() => setShowFilters(!showFilters)}
            className="min-h-[36px] justify-center"
          >
            <Text className="font-figtree-semibold text-[14px] text-white underline">
              {showFilters ? t.investorHideFilters : t.investorFilters}
            </Text>
          </Pressable>
        </View>
        {showFilters ? <View className="rounded-[16px] bg-surface px-4 py-4">{fields}</View> : null}
      </View>
      <View className="flex-row flex-wrap items-center gap-1 self-start rounded-full border border-line bg-surface p-1">
        <View className="min-h-[40px] items-center justify-center rounded-full bg-navy px-4">
          <Text className="font-figtree-bold text-[14px] text-white">{t.investorAllIdeas}</Text>
        </View>
        {tab("/ideas/saved", t.investorSaved)}
        {tab("/ideas/mine", t.ideasMine)}
        {tab("/plans", t.plansTitle)}
      </View>
      <InvestorList
        key={JSON.stringify(filters)}
        investor={investor}
        filters={filters}
        savedOnly={false}
        withSide
        focus={focus.state === "ready" ? focus.value : null}
      />
    </View>
  );
}

const REQUEST_STATUSES = ["pending", "approved", "nda_accepted", "declined"] as const;

/** S22 for a flag holder: the investor's own interest requests, by status, newest three listed. */
function MyRequests({ investor }: { investor: InvestorApi }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const loaded = useLoad(() => investor.myRequests().catch(() => []), 0);
  if (loaded.state !== "ready" || loaded.value.length === 0) return null;
  const requests = loaded.value;
  const label = {
    pending: t.investorReqPending,
    approved: t.investorReqApproved,
    nda_accepted: t.investorReqNda,
    declined: t.investorReqDeclined,
  };
  const colour = {
    pending: palette.crimson,
    approved: palette.goldDeep,
    nda_accepted: palette.teal,
    declined: palette.violet,
  };
  const chip = {
    pending: ["bg-surface-2 text-ink", t.investorReqWaiting],
    approved: ["bg-warn-soft text-warn-text", t.investorReqAcceptNda],
    nda_accepted: ["bg-good-soft text-good-text", t.investorReqOpen],
    declined: ["bg-surface-2 text-ink-2", t.investorReqDeclined],
    revoked: ["bg-surface-2 text-ink-2", t.investorReqDeclined],
  } as const;
  return (
    <View className="gap-3 rounded-card border border-line bg-surface px-5 py-5">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {t.investorMyRequests}
      </Text>
      <Donut
        unit={t.investorRequestsUnit}
        parts={REQUEST_STATUSES.map((status) => ({
          label: label[status],
          value: requests.filter((r) => r.status === status).length,
          color: colour[status],
        }))}
      />
      {requests.slice(0, 3).map((r) => (
        <LinkButton
          key={r.ideaId}
          href={`/ideas/${r.ideaId}`}
          label={r.title}
          className="flex-row items-center gap-2 border-t border-line pt-3"
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-figtree-bold text-[14px] text-ink">
              {r.title}
            </Text>
            <Text className="font-figtree text-[12px] text-ink-2">
              {r.anonymous ? t.investorAskedAnon : t.investorAskedNamed}
            </Text>
          </View>
          <Text
            className={`rounded-full px-2.5 py-1 font-figtree-bold text-[11px] ${chip[r.status][0]}`}
          >
            {chip[r.status][1]}
          </Text>
        </LinkButton>
      ))}
    </View>
  );
}

/** S29: the investor's private saved list. Absent for anyone without the flag. */
export function SavedIdeas({ investor }: { investor: InvestorApi }) {
  const { t } = useLanguage();
  const status = useLoad(() => investor.status(), 0);
  if (status.state === "failed")
    return <ErrorState message={t.ideasPoolLoadFailed} onRetry={() => undefined} />;
  if (status.state === "loading") return <LoadingRows />;
  if (status.value !== "investor") {
    return (
      <EmptyState
        title={t.ideaNotFound}
        message=""
        action={{ label: t.ideaBackToPool, href: "/ideas" }}
      />
    );
  }
  return (
    <View className="gap-3">
      <ScreenTitle>{t.investorSaved}</ScreenTitle>
      <Text className="font-figtree text-sm text-ink-2">{t.investorSavedPrivate}</Text>
      <InvestorList investor={investor} filters={NO_FILTERS} savedOnly />
    </View>
  );
}

/** IDEA-6: a Level 2 member applies for investor tools, or sees where the application stands. */
export function InvestorApply({ ideas, investor }: { ideas: IdeasApi; investor: InvestorApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    async () => ({ status: await investor.status(), sectors: await ideas.sectors(language) }),
    attempt,
  );
  const [sectorId, setSectorId] = useState("");
  const [band, setBand] = useState<TicketBand | undefined>(undefined);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loaded.state === "failed") {
    return <ErrorState message={t.ideasPoolLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  const { status, sectors } = loaded.value;
  if (status === "none") {
    return (
      <EmptyState
        title={t.ideaNotFound}
        message=""
        action={{ label: t.ideaBackToPool, href: "/ideas" }}
      />
    );
  }

  return (
    <View className="gap-4">
      <ScreenTitle>{t.investorApplyTitle}</ScreenTitle>
      {status === "investor" ? (
        <Message tone="info" text={t.investorHaveTools} />
      ) : status === "applied" ? (
        <Message tone="info" text={t.investorApplied} />
      ) : (
        <>
          <Text className="font-figtree text-[15px] leading-6 text-ink">
            {t.investorApplyIntro}
          </Text>
          {status === "declined" ? <Message tone="info" text={t.investorDeclined} /> : null}
          <ChoiceList
            label={t.investorSectorFocus}
            options={sectors}
            value={sectorId || undefined}
            onChange={setSectorId}
          />
          <Chips<TicketBand>
            label={t.investorBandLabel}
            options={BANDS.map((b) => ({ value: b, label: bandText(t, b) }))}
            value={band}
            onChange={setBand}
          />
          <Field label={t.investorNoteLabel} value={note} multiline onChange={setNote} />
          <Message text={problem} />
          <Button
            label={t.investorApplySend}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setProblem(null);
              const result = await investor
                .apply(sectorId || null, band ?? null, note)
                .catch(() => "error");
              setBusy(false);
              if (result === "ok" || result === "already_applied") setAttempt((a) => a + 1);
              else
                setProblem(result === "contact_details" ? t.eventProblemContact : t.interestFailed);
            }}
          />
        </>
      )}
    </View>
  );
}

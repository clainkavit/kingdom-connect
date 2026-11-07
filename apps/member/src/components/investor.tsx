import { IDEA_STAGES, parseTzs, type IdeaStage, type Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import type { IdeasApi } from "../lib/ideas";
import {
  type InvestorApi,
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
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
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
  return (
    <Button
      secondary
      label={saved ? t.investorUnsave : t.investorSave}
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        const result = await investor.setSaved(idea.id, !saved).catch(() => "error");
        setBusy(false);
        if (result === "ok") setSaved(!saved);
      }}
    />
  );
}

/** A page of the investor pool, with Load more. */
function InvestorList({
  investor,
  filters,
  savedOnly,
}: {
  investor: InvestorApi;
  filters: InvestorFilters;
  savedOnly: boolean;
}) {
  const { t } = useLanguage();
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
  return (
    <>
      {[...first.value, ...more].map((idea) => (
        <IdeaCard key={idea.id} idea={idea}>
          {idea.isMine ? null : <SaveButton idea={idea} investor={investor} />}
        </IdeaCard>
      ))}
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
  const options = useLoad(
    async () => ({
      sectors: await ideas.sectors(language),
      regions: await investor.regions(language),
    }),
    0,
  );
  const [draft, setDraft] = useState({ sectorId: "", stage: "", min: "", max: "", regionId: "" });
  const [filters, setFilters] = useState<InvestorFilters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
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

  return (
    <View className="gap-3">
      <ScreenTitle>{t.navIdeas}</ScreenTitle>
      <View className="flex-row flex-wrap gap-2">
        <LinkButton
          href="/ideas/saved"
          label={t.investorSaved}
          className="min-h-[48px] items-center justify-center rounded-[10px] border border-line bg-surface px-4"
        >
          <Text className="font-figtree-semibold text-[15px] text-ink">{t.investorSaved}</Text>
        </LinkButton>
        <LinkButton
          href="/ideas/mine"
          label={t.ideasMine}
          className="min-h-[48px] items-center justify-center rounded-[10px] border border-line bg-surface px-4"
        >
          <Text className="font-figtree-semibold text-[15px] text-ink">{t.ideasMine}</Text>
        </LinkButton>
        <Button
          secondary
          label={showFilters ? t.investorHideFilters : t.investorFilters}
          onPress={() => setShowFilters((s) => !s)}
        />
      </View>
      {showFilters && options.state === "ready" ? (
        <Section title={t.investorFilters}>
          <ChoiceList
            label={t.ideaSectorLabel}
            options={options.value.sectors}
            value={draft.sectorId || undefined}
            onChange={(sectorId) => setDraft({ ...draft, sectorId })}
          />
          <Chips<IdeaStage>
            label={t.ideaStageLabel}
            options={IDEA_STAGES.map((s) => ({ value: s, label: stageLabel(t, s) }))}
            value={(draft.stage || undefined) as IdeaStage | undefined}
            onChange={(stage) => setDraft({ ...draft, stage })}
          />
          <Field
            label={t.investorMinLabel}
            value={draft.min}
            keyboardType="number-pad"
            onChange={(min) => setDraft({ ...draft, min })}
          />
          <Field
            label={t.investorMaxLabel}
            value={draft.max}
            keyboardType="number-pad"
            onChange={(max) => setDraft({ ...draft, max })}
          />
          <ChoiceList
            label={t.investorRegionLabel}
            options={options.value.regions}
            value={draft.regionId || undefined}
            onChange={(regionId) => setDraft({ ...draft, regionId })}
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
        </Section>
      ) : null}
      <InvestorList
        key={JSON.stringify(filters)}
        investor={investor}
        filters={filters}
        savedOnly={false}
      />
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

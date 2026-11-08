import {
  checkIdea,
  IDEA_SEEKING,
  IDEA_STAGES,
  type IdeaDraft,
  type IdeaProblem,
  type IdeaSeeking,
  type IdeaStage,
  type Strings,
} from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { IdeasApi, MyIdea } from "../lib/ideas";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button, Checkbox, Chips, ChoiceList, ConfirmButton, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

export const stageLabel = (t: Strings, stage: IdeaStage): string =>
  ({
    idea: t.ideaStageIdea,
    prototype: t.ideaStagePrototype,
    early_revenue: t.ideaStageEarlyRevenue,
    growing: t.ideaStageGrowing,
  })[stage];

export const seekingLabel = (t: Strings, seeking: IdeaSeeking): string =>
  ({
    investor: t.ideaSeekingInvestor,
    partner: t.ideaSeekingPartner,
    both: t.ideaSeekingBoth,
  })[seeking];

const statusLabel = (t: Strings, status: MyIdea["status"]): string =>
  ({
    draft: t.ideaStatusDraft,
    pending_moderation: t.ideaStatusPending,
    published: t.ideaStatusPublished,
    archived: t.ideaStatusArchived,
    hidden: t.ideaStatusHidden,
    removed: t.ideaStatusRemoved,
  })[status];

function MyIdeaRow({
  idea,
  api,
  onChanged,
}: {
  idea: MyIdea;
  api: IdeasApi;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-4">
      <Text className="font-figtree-bold text-[16px] text-ink">{idea.title}</Text>
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {idea.status === "draft" && idea.reviewReason
          ? t.ideaNotApproved(idea.reviewReason)
          : statusLabel(t, idea.status)}
        {idea.showOwner ? "" : ` · ${t.ideaWithoutName}`}
      </Text>
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        {idea.status === "draft" ? (
          <LinkButton
            href={`/ideas/new?id=${idea.id}`}
            label={t.eventsEdit}
            className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-sm text-ink-2">{t.eventsEdit}</Text>
          </LinkButton>
        ) : null}
        {idea.status === "published" ? (
          <ConfirmButton
            label={t.ideaArchive}
            question={t.ideaArchiveConfirm}
            confirmLabel={t.ideaArchive}
            onConfirm={async () => {
              const result = await api.archive(idea.id).catch(() => "error");
              if (result === "ok") onChanged();
              else setProblem(t.eventsActionFailed);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** S27: the member's own ideas with their status, and Share an idea (I01). The pool arrives with I02. */
export function MyIdeas({ api }: { api: IdeasApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.mine(), attempt);
  const reload = () => setAttempt((a) => a + 1);

  return (
    <View className="gap-3">
      <ScreenTitle>{t.navIdeas}</ScreenTitle>
      <Text className="font-figtree text-sm text-ink-2">{t.ideasPoolSoon}</Text>
      <LinkButton
        href="/ideas/new"
        label={t.ideasShare}
        className="min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4"
      >
        <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.ideasShare}</Text>
      </LinkButton>
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {t.ideasMine}
      </Text>
      {loaded.state === "failed" ? (
        <ErrorState message={t.ideasLoadFailed} onRetry={reload} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.ideasEmptyTitle} message={t.ideasEmptyMessage} />
      ) : (
        loaded.value.map((idea) => (
          <MyIdeaRow key={idea.id} idea={idea} api={api} onChanged={reload} />
        ))
      )}
    </View>
  );
}

const problemText = (
  t: Strings,
  problem: IdeaProblem | "contact_details" | "posting_paused",
): string =>
  ({
    title: t.ideaProblemTitle,
    problem: t.ideaProblemProblem,
    sector: t.ideaProblemSector,
    stage: t.ideaProblemStage,
    seeking: t.ideaProblemSeeking,
    range: t.ideaProblemRange,
    description: t.ideaProblemDescription,
    detail_too_long: t.ideaProblemDetailTooLong,
    contact_details: t.eventProblemContact,
    posting_paused: t.ideaProblemPaused,
  })[problem];

const fromServer: Record<string, IdeaProblem | "contact_details" | "posting_paused"> = {
  invalid_title: "title",
  invalid_problem: "problem",
  invalid_sector: "sector",
  invalid_stage: "stage",
  invalid_seeking: "seeking",
  invalid_range: "range",
  invalid_description: "description",
  detail_too_long: "detail_too_long",
  contact_details: "contact_details",
  posting_paused: "posting_paused",
};

const blank: IdeaDraft = {
  title: "",
  problem: "",
  sectorId: "",
  stage: "",
  seeking: "",
  investmentMin: "",
  investmentMax: "",
  showOwner: true,
  description: "",
  businessModel: "",
  market: "",
  financials: "",
  team: "",
};

type TextKeyOf =
  | "title"
  | "problem"
  | "investmentMin"
  | "investmentMax"
  | "description"
  | "businessModel"
  | "market"
  | "financials"
  | "team";

/** S27: share an idea, or edit a draft one. The summary and the confidential details are kept apart. */
export function IdeaForm({ api, ideaId }: { api: IdeasApi; ideaId: string | null }) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const sectors = await api.sectors(language);
    if (!ideaId) return { sectors, draft: blank };
    const existing = (await api.mine()).find((i) => i.id === ideaId && i.status === "draft");
    return { sectors, draft: existing ? existing.draft : null };
  }, attempt);
  const [draft, setDraft] = useState<IdeaDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loaded.state === "ready" && loaded.value.draft && draft === null)
      setDraft(loaded.value.draft);
  }, [loaded, draft]);

  if (loaded.state === "failed") {
    return <ErrorState message={t.ideasLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  if (!loaded.value.draft) {
    return (
      <EmptyState
        title={t.eventsNotFound}
        message=""
        action={{ label: t.ideasMine, href: "/ideas" }}
      />
    );
  }
  const form = draft ?? loaded.value.draft;
  const set = (key: TextKeyOf) => (value: string) => setDraft({ ...form, [key]: value });

  const save = async (submit: boolean) => {
    const local = checkIdea(form);
    if (local) return setProblem(problemText(t, local));
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const saved = await api.save(ideaId, form, submit);
      const known = fromServer[saved.result];
      if (known) {
        setProblem(problemText(t, known));
      } else if (saved.result === "pending_moderation" || saved.result === "draft") {
        setNotice(saved.result === "draft" ? t.eventSaved : t.eventSent);
        router.push("/ideas");
      } else {
        setProblem(t.eventsActionFailed);
      }
    } catch {
      setProblem(t.saveFailed);
    }
    setBusy(false);
  };

  return (
    <View className="gap-4">
      <ScreenTitle>{ideaId ? t.ideasEditTitle : t.ideasShare}</ScreenTitle>
      <Section title={t.ideaSummaryHeading}>
        <Text className="font-figtree text-[13px] text-ink-2">{t.ideaSummaryHint}</Text>
        <Field label={t.ideaTitleLabel} value={form.title} onChange={set("title")} />
        <Field
          label={t.ideaProblemLabel}
          value={form.problem}
          multiline
          onChange={set("problem")}
        />
        <ChoiceList
          label={t.ideaSectorLabel}
          options={loaded.value.sectors}
          value={form.sectorId || undefined}
          onChange={(sectorId) => setDraft({ ...form, sectorId })}
        />
        <Chips<IdeaStage>
          label={t.ideaStageLabel}
          options={IDEA_STAGES.map((s) => ({ value: s, label: stageLabel(t, s) }))}
          value={form.stage || undefined}
          onChange={(stage) => setDraft({ ...form, stage })}
        />
        <Chips<IdeaSeeking>
          label={t.ideaSeekingLabel}
          options={IDEA_SEEKING.map((s) => ({ value: s, label: seekingLabel(t, s) }))}
          value={form.seeking || undefined}
          onChange={(seeking) => setDraft({ ...form, seeking })}
        />
        <Field
          label={t.ideaMinLabel}
          value={form.investmentMin}
          keyboardType="number-pad"
          onChange={set("investmentMin")}
        />
        <Field
          label={t.ideaMaxLabel}
          value={form.investmentMax}
          keyboardType="number-pad"
          onChange={set("investmentMax")}
        />
        <Checkbox
          label={t.ideaShowOwnerLabel}
          checked={form.showOwner}
          onChange={(showOwner) => setDraft({ ...form, showOwner })}
        />
        <Text className="font-figtree text-[13px] text-ink-2">{t.ideaShowOwnerHint}</Text>
      </Section>
      <Section title={t.ideaDetailsHeading}>
        <Field
          label={t.ideaDescriptionLabel}
          value={form.description}
          multiline
          onChange={set("description")}
        />
        <Field
          label={t.ideaModelLabel}
          value={form.businessModel}
          multiline
          onChange={set("businessModel")}
        />
        <Field label={t.ideaMarketLabel} value={form.market} multiline onChange={set("market")} />
        <Field
          label={t.ideaFinancialsLabel}
          value={form.financials}
          multiline
          onChange={set("financials")}
        />
        <Field label={t.ideaTeamLabel} value={form.team} multiline onChange={set("team")} />
      </Section>
      <Message text={problem} />
      <Message text={notice} tone="info" />
      <Text className="font-figtree text-[13px] text-ink-2">{t.ideaSubmitHint}</Text>
      <Button label={t.eventSubmit} disabled={busy} onPress={() => save(true)} />
      <Button secondary label={t.eventSaveDraft} disabled={busy} onPress={() => save(false)} />
    </View>
  );
}

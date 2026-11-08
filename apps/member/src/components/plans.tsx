import { formatDate, type Strings } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { Plan, PlanStatus, PlansApi, PlanSummary, StepDraft } from "../lib/plans";
import { useLoad } from "./events";
import { Button, Chips, ChoiceList, ConfirmButton, Field, Message } from "./form";
import { AcceptTexts } from "./legal";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

export const MAX_EXTRA_STEPS = 9;
const DAY = 24 * 60 * 60 * 1000;

export const planStatusLabel = (t: Strings, status: PlanStatus): string =>
  ({
    pending: t.planStatusPending,
    active: t.planStatusActive,
    completed: t.planStatusCompleted,
    lapsed: t.planStatusLapsed,
    withdrawn: t.planStatusWithdrawn,
    ended: t.planStatusEnded,
  })[status];

const milestoneStatusLabel = (t: Strings, status: Plan["milestoneList"][number]["status"]) =>
  ({ open: t.milestoneOpen, done: t.milestoneDone, confirmed: t.milestoneConfirmed })[status];

const daysLeft = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY));

/** Today in Tanzania as YYYY-MM-DD, to check target dates before sending. */
export const tanzaniaToday = (now = new Date()) =>
  new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function checkStep(step: StepDraft, today: string): "title" | "date" | null {
  if (step.title.trim().length < 2 || step.title.trim().length > 120) return "title";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(step.targetDate) || Number.isNaN(Date.parse(step.targetDate)))
    return "date";
  if (step.targetDate < today) return "date";
  return null;
}

function PlanCard({ plan }: { plan: PlanSummary }) {
  const { t } = useLanguage();
  return (
    <LinkButton
      href={`/plans/${plan.id}`}
      label={`${plan.itemTitle} · ${plan.otherName}`}
      className="gap-1 rounded-card border border-line bg-surface p-4"
    >
      <Text className="font-figtree-bold text-[16px] text-ink">{plan.itemTitle}</Text>
      <Text className="font-figtree text-[14px] text-ink">{t.planWith(plan.otherName)}</Text>
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {planStatusLabel(t, plan.status)} · {t.planProgress(plan.confirmed, plan.milestones)}
      </Text>
    </LinkButton>
  );
}

/** S30: all my plans with their status. */
export function MyPlans({ api }: { api: PlansApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.mine(), attempt);
  return (
    <View className="gap-3">
      <ScreenTitle>{t.plansTitle}</ScreenTitle>
      <LinkButton
        href="/plans/new"
        label={t.planPropose}
        className="min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4"
      >
        <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.planPropose}</Text>
      </LinkButton>
      {loaded.state === "failed" ? (
        <ErrorState message={t.plansLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.plansEmptyTitle} message={t.plansEmptyMessage} />
      ) : (
        loaded.value.map((plan) => <PlanCard key={plan.id} plan={plan} />)
      )}
    </View>
  );
}

const blankStep = (): StepDraft => ({
  title: "",
  description: "",
  targetDate: "",
  responsible: "me",
});

/** The hand-off disclaimer, accepted before sending or accepting a plan. */
function Handoff({
  api,
  acceptLabel,
  onAccept,
}: {
  api: PlansApi;
  acceptLabel: string;
  onAccept: (handoffId: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const text = useLoad(() => api.handoff(), attempt);
  if (text.state === "failed") {
    return <ErrorState message={t.plansLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (text.state === "loading") return <LoadingRows rows={1} />;
  if (!text.value) return <Message tone="info" text={t.ndaMissing} />;
  const handoff = text.value;
  return (
    <AcceptTexts
      key={attempt}
      texts={[handoff]}
      entityName=""
      intro={t.planHandoffIntro}
      acceptLabel={acceptLabel}
      onAccept={async () => {
        await onAccept(handoff.id);
        setAttempt((a) => a + 1);
      }}
    />
  );
}

const proposeProblem = (t: Strings, result: string) =>
  ({
    not_allowed: t.planNotAllowed,
    already_planned: t.planAlreadyPlanned,
    invalid_step: t.planProblemTitle,
    invalid_steps: t.planProblemTitle,
    invalid_date: t.planProblemDate,
    contact_details: t.eventProblemContact,
    handoff_changed: t.ndaChanged,
  })[result] ?? t.plansActionFailed;

/** S31: propose a plan to an idea partner: stages after stage 1, who does each, and the disclaimer. */
export function ProposePlan({
  api,
  ideaId,
  otherId,
}: {
  api: PlansApi;
  ideaId: string | null;
  otherId: string | null;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const partners = useLoad(() => api.partners(), attempt);
  const [chosen, setChosen] = useState<string | null>(
    ideaId && otherId ? `${ideaId}|${otherId}` : null,
  );
  const [steps, setSteps] = useState<StepDraft[]>([blankStep()]);
  const [problem, setProblem] = useState<string | null>(null);

  if (partners.state === "failed") {
    return <ErrorState message={t.plansLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (partners.state === "loading") return <LoadingRows />;
  if (partners.value.length === 0) {
    return (
      <EmptyState
        title={t.planNoPartnersTitle}
        message={t.plansEmptyMessage}
        action={{ label: t.navIdeas, href: "/ideas" }}
      />
    );
  }
  const options = partners.value.map((p) => ({
    value: `${p.ideaId}|${p.otherId}`,
    label: `${p.ideaTitle} · ${p.otherName}`,
  }));
  const forIdea = ideaId && !otherId ? options.filter((o) => o.value.startsWith(`${ideaId}|`)) : [];
  const choice = options.some((o) => o.value === chosen)
    ? chosen
    : forIdea.length === 1
      ? (forIdea[0]?.value ?? null)
      : null;
  const setStep = (i: number, next: Partial<StepDraft>) =>
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...next } : s)));

  const send = async (handoffId: string) => {
    if (!choice) return setProblem(t.planProblemPartner);
    const today = tanzaniaToday();
    for (const step of steps) {
      const bad = checkStep(step, today);
      if (bad) return setProblem(bad === "title" ? t.planProblemTitle : t.planProblemDate);
    }
    setProblem(null);
    const [idea, other] = choice.split("|") as [string, string];
    const sent = await api.propose(idea, other, steps, handoffId).catch(() => ({
      result: "error",
      planId: null,
    }));
    if (sent.result === "ok" && sent.planId) router.push(`/plans/${sent.planId}`);
    else setProblem(proposeProblem(t, sent.result));
  };

  return (
    <View className="gap-4">
      <ScreenTitle>{t.planPropose}</ScreenTitle>
      <ChoiceList
        label={t.planPartnerLabel}
        options={options}
        value={choice ?? undefined}
        onChange={setChosen}
      />
      <Section title={t.planStagesHeading}>
        <Text className="font-figtree text-[13px] text-ink-2">{t.planStage1Hint}</Text>
        {steps.map((step, i) => (
          <View key={i} className="gap-2 rounded-card border border-line p-3">
            <Text className="font-figtree-bold text-[15px] text-ink">
              {t.planStageNumber(i + 2)}
            </Text>
            <Field
              label={t.planStepTitle}
              value={step.title}
              onChange={(title) => setStep(i, { title })}
            />
            <Field
              label={t.planStepDescription}
              value={step.description}
              multiline
              onChange={(description) => setStep(i, { description })}
            />
            <Field
              label={t.planStepDate}
              value={step.targetDate}
              onChange={(targetDate) => setStep(i, { targetDate })}
            />
            <Chips<"me" | "other">
              label={t.planStepResponsible}
              options={[
                { value: "me", label: t.planMe },
                { value: "other", label: t.planOther },
              ]}
              value={step.responsible}
              onChange={(responsible) => setStep(i, { responsible })}
            />
            <Button
              secondary
              label={t.planRemoveStage}
              onPress={() => setSteps(steps.filter((_, j) => j !== i))}
            />
          </View>
        ))}
        {steps.length < MAX_EXTRA_STEPS ? (
          <Button
            secondary
            label={t.planAddStage}
            onPress={() => setSteps([...steps, blankStep()])}
          />
        ) : null}
      </Section>
      <Message text={problem} />
      <Handoff api={api} acceptLabel={t.planSend} onAccept={send} />
    </View>
  );
}

const acceptProblem = (t: Strings, result: string) =>
  ({ handoff_changed: t.ndaChanged, not_pending: t.planLapsedMessage })[result] ??
  t.plansActionFailed;

function Milestones({
  plan,
  api,
  onChanged,
}: {
  plan: Plan;
  api: PlansApi;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step = async (run: () => Promise<string>) => {
    setBusy(true);
    setProblem(null);
    const result = await run().catch(() => "error");
    setBusy(false);
    if (result === "ok") onChanged();
    else setProblem(t.plansActionFailed);
  };
  return (
    <Section title={t.planStagesHeading}>
      {plan.milestoneList.map((m) => (
        <View key={m.id} className="gap-1 rounded-card border border-line p-3">
          <Text className="font-figtree-bold text-[15px] text-ink">
            {t.planStageNumber(m.position)}: {m.position === 1 ? t.planStage1Title : m.title}
          </Text>
          {m.description ? (
            <Text className="font-figtree text-[14px] text-ink">{m.description}</Text>
          ) : null}
          <Text className="font-figtree text-[13px] text-ink-2">
            {[
              m.targetDate
                ? formatDate(new Date(`${m.targetDate}T12:00:00+03:00`), language)
                : null,
              m.responsibleIsMe ? t.planYouDoIt : t.planTheyDoIt(plan.otherName),
              milestoneStatusLabel(t, m.status),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {plan.status === "active" && m.status === "open" && m.responsibleIsMe ? (
            <Button
              secondary
              label={t.milestoneMarkDone}
              disabled={busy}
              onPress={() => step(() => api.markDone(m.id))}
            />
          ) : null}
          {plan.status === "active" && m.status === "done" && !m.responsibleIsMe ? (
            <Button
              label={t.milestoneConfirm}
              disabled={busy}
              onPress={() => step(() => api.confirm(m.id))}
            />
          ) : null}
        </View>
      ))}
      <Message text={problem} />
    </Section>
  );
}

const HOUR = 60 * 60 * 1000;

/** S33: in the first hour after stage 1 either member may withdraw; after it, End plan with a reason. */
function ActivePlan({
  plan,
  api,
  onChanged,
}: {
  plan: Plan;
  api: PlansApi;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const agreed = plan.stage1AgreedAt ? new Date(plan.stage1AgreedAt).getTime() : 0;
  const minutesLeft = Math.ceil((agreed + HOUR - Date.now()) / 60000);

  if (minutesLeft > 0) {
    return (
      <View className="gap-2">
        <Message tone="info" text={t.planWithdrawWindow(minutesLeft)} />
        <ConfirmButton
          label={t.planWithdraw}
          question={t.planWithdrawConfirm}
          confirmLabel={t.planWithdraw}
          onConfirm={async () => {
            const result = await api.withdraw(plan.id).catch(() => "error");
            if (result === "ok") onChanged();
            else setProblem(t.plansActionFailed);
          }}
        />
        <Message text={problem} />
      </View>
    );
  }
  if (!ending) {
    return (
      <View className="gap-2">
        <Message tone="info" text={t.planStage1Agreed} />
        <Button secondary label={t.planEnd} onPress={() => setEnding(true)} />
      </View>
    );
  }
  return (
    <Section title={t.planEnd}>
      <Text className="font-figtree text-sm text-ink">{t.planEndHint}</Text>
      <Field label={t.planEndReason} value={reason} multiline onChange={setReason} />
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t.planEndConfirm}
          disabled={busy}
          onPress={async () => {
            if (reason.trim().length < 3) return setProblem(t.planEndReasonNeeded);
            setBusy(true);
            setProblem(null);
            const result = await api.end(plan.id, reason).catch(() => "error");
            setBusy(false);
            if (result === "ok") onChanged();
            else
              setProblem(
                result === "contact_details" ? t.eventProblemContact : t.plansActionFailed,
              );
          }}
        />
        <Button secondary label={t.cancel} onPress={() => setEnding(false)} />
      </View>
    </Section>
  );
}

/** S32 and S33: one plan. The other member reviews and accepts; either may start a lapsed one again. */
export function PlanScreen({ api, planId }: { api: PlansApi; planId: string }) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.load(planId), attempt);
  const [problem, setProblem] = useState<string | null>(null);
  const reload = () => setAttempt((a) => a + 1);

  if (loaded.state === "failed") {
    return <ErrorState message={t.plansLoadFailed} onRetry={reload} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  const plan = loaded.value;
  if (!plan) {
    return (
      <EmptyState
        title={t.planNotFound}
        message=""
        action={{ label: t.plansTitle, href: "/plans" }}
      />
    );
  }

  return (
    <View className="gap-4">
      <ScreenTitle>{plan.itemTitle}</ScreenTitle>
      <Text className="font-figtree-semibold text-[15px] text-ink">
        {t.planWith(plan.otherName)} · {planStatusLabel(t, plan.status)}
      </Text>
      <Message text={problem} />
      {plan.status === "pending" && plan.startedByMe ? (
        <>
          <Message tone="info" text={t.planWaiting(plan.otherName, daysLeft(plan.expiresAt))} />
          <ConfirmButton
            label={t.planWithdraw}
            question={t.planWithdrawConfirm}
            confirmLabel={t.planWithdraw}
            onConfirm={async () => {
              const result = await api.withdraw(plan.id).catch(() => "error");
              if (result === "ok") reload();
              else setProblem(t.plansActionFailed);
            }}
          />
        </>
      ) : null}
      {plan.status === "lapsed" ? <Message tone="info" text={t.planLapsedMessage} /> : null}
      {plan.status === "withdrawn" ? <Message tone="info" text={t.planWithdrawnMessage} /> : null}
      {plan.status === "ended" && plan.closedAt ? (
        <Message
          tone="info"
          text={t.planEndedBy(
            plan.closedByMe ? t.planYouDoIt : plan.otherName,
            formatDate(new Date(plan.closedAt), language),
            plan.endedReason ?? "",
          )}
        />
      ) : null}
      {plan.status === "active" ? <ActivePlan plan={plan} api={api} onChanged={reload} /> : null}
      <Milestones plan={plan} api={api} onChanged={reload} />
      {plan.status === "pending" && !plan.startedByMe ? (
        <Section title={t.planReviewHeading}>
          <Message tone="info" text={t.planExpiresIn(daysLeft(plan.expiresAt))} />
          <Handoff
            api={api}
            acceptLabel={t.planAccept}
            onAccept={async (handoffId) => {
              const result = await api.accept(plan.id, handoffId);
              if (result === "ok") reload();
              else setProblem(acceptProblem(t, result));
            }}
          />
        </Section>
      ) : null}
      {plan.status === "lapsed" || plan.status === "withdrawn" ? (
        <Section title={t.planStartAgain}>
          <Handoff
            api={api}
            acceptLabel={t.planStartAgain}
            onAccept={async (handoffId) => {
              const restarted = await api.restart(plan.id, handoffId);
              if (restarted.result === "ok" && restarted.planId)
                router.push(`/plans/${restarted.planId}`);
              else setProblem(proposeProblem(t, restarted.result));
            }}
          />
        </Section>
      ) : null}
    </View>
  );
}

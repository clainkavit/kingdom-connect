"use client";

import { formatDate, type Strings } from "@kingdom-connect/shared";
import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import type { AdminNote, AdminPlan, AdminStage, PlansAdminApi, PlanStatus } from "@/lib/plans";
import { Card, Notice, Row } from "./cards";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const statusText = (t: Strings, status: PlanStatus) =>
  ({
    pending: t.planStatusPending,
    active: t.planStatusActive,
    completed: t.planStatusCompleted,
    lapsed: t.planStatusLapsed,
    withdrawn: t.planStatusWithdrawn,
    ended: t.planStatusEnded,
  })[status];

const stageText = (t: Strings, status: AdminStage["status"]) =>
  ({ open: t.milestoneOpen, done: t.milestoneDone, confirmed: t.milestoneConfirmed })[status];

function PlanDetail({ plan, api }: { plan: AdminPlan; api: PlansAdminApi }) {
  const { t, language } = useLanguage();
  const [detail, setDetail] = useState<
    { stages: AdminStage[]; notes: AdminNote[] } | "failed" | null
  >(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    Promise.all([api.stages(plan.id), api.notes(plan.id)])
      .then(([stages, notes]) => setDetail({ stages, notes }))
      .catch(() => setDetail("failed"));
  }, [api, plan.id]);
  useEffect(load, [load]);

  if (detail === "failed") return <ErrorState message={t.decideFailed} onRetry={load} />;
  if (detail === null) return <LoadingRows rows={1} />;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1.5">
        {detail.stages.map((s) => (
          <li key={s.position} className="text-sm text-foreground">
            {t.planStageNumber(s.position)}: {s.position === 1 ? t.planStage1Title : s.title} ·{" "}
            {s.responsible} · {stageText(t, s.status)}
            {s.targetDate
              ? ` · ${formatDate(new Date(`${s.targetDate}T12:00:00+03:00`), language)}`
              : ""}
          </li>
        ))}
      </ol>
      {detail.notes.map((n, i) => (
        <p key={i} className="text-sm text-ink-2">
          {n.kind === "ended"
            ? t.adminPlanEndedNote(n.author, n.note)
            : t.adminPlanAnnotation(n.author, n.note)}{" "}
          · {formatDate(n.createdAt, language)}
        </p>
      ))}
      <Field
        id={`note-${plan.id}`}
        label={t.adminPlanAddNote}
        value={note}
        onChange={setNote}
        multiline
      />
      <p className="text-xs text-ink-2">{t.adminPlanNoteFinal}</p>
      <Notice tone="bad" text={problem} />
      <div>
        <button
          type="button"
          disabled={busy || note.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            const result = await api.annotate(plan.id, note).catch(() => "failed");
            setBusy(false);
            if (result === "ok") {
              setNote("");
              setProblem(null);
              load();
            } else setProblem(t.decideFailed);
          }}
          className={buttonVariants({ variant: "default" })}
        >
          {t.adminPlanSaveNote}
        </button>
      </div>
    </div>
  );
}

function PlanCard({ plan, api }: { plan: AdminPlan; api: PlansAdminApi }) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <Card title={`${plan.memberA} & ${plan.memberB}`}>
      <Row label={t.adminPlanItem} value={plan.item} />
      <Row label={t.adminPlanStatus} value={statusText(t, plan.status)} />
      <Row label={t.adminPlanProgress} value={t.planProgress(plan.confirmed, plan.milestones)} />
      <Row
        label={t.adminPlanDates}
        value={`${formatDate(plan.createdAt, language)}${plan.closedAt ? ` – ${formatDate(plan.closedAt, language)}` : ""}`}
      />
      <Row label={t.adminPlanStartedBy} value={plan.startedBy} />
      <div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={buttonVariants({ variant: "outline" })}
        >
          {open ? t.adminPlanHide : t.adminPlanShow}
        </button>
      </div>
      {open ? <PlanDetail plan={plan} api={api} /> : null}
    </Card>
  );
}

/** A14: every milestone plan with names, the idea, stage statuses, dates and notes (P04). */
export function PlansAdminScreen({ api }: { api: PlansAdminApi }) {
  const { t } = useLanguage();
  const [state, setState] = useState<"loading" | "failed" | AdminPlan[]>("loading");
  const load = useCallback(() => {
    api
      .plans()
      .then(setState)
      .catch(() => setState("failed"));
  }, [api]);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{t.adminNavPlans}</ScreenTitle>
      <p className="text-sm text-ink-2">{t.adminPlansIntro}</p>
      {state === "failed" ? (
        <ErrorState message={t.decideFailed} onRetry={load} />
      ) : state === "loading" ? (
        <LoadingRows />
      ) : state.length === 0 ? (
        <EmptyState title={t.plansEmptyTitle} message="" />
      ) : (
        state.map((plan) => <PlanCard key={plan.id} plan={plan} api={api} />)
      )}
    </div>
  );
}

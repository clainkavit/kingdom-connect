"use client";

import {
  formatDate,
  reportReasonLabel,
  type ReportReason,
  type Strings,
  type TextKey,
} from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import {
  automaticStep,
  type ActionResult,
  type CaseDetail,
  type CaseSummary,
  type ModerationAction,
  type ReportsApi,
  type Subject,
} from "@/lib/reports";
import { Card, Notice, Row } from "./cards";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const actionLabel: Record<ModerationAction, TextKey> = {
  no_action: "actionNoAction",
  warn: "actionWarn",
  suspend_posting: "actionSuspendPosting",
  suspend_account: "actionSuspendAccount",
};

const reasonText = (t: Strings, reason: ReportReason) => t[reportReasonLabel[reason]] as string;

function problemText(t: Strings, result: ActionResult): string | null {
  return {
    done: null,
    note_required: t.staffNoteRequired,
    message_required: t.memberMessageRequired,
    already_decided: t.caseAlreadyDecided,
    not_paused: t.memberStateChanged,
    not_suspended: t.memberStateChanged,
    failed: t.decideFailed,
  }[result];
}

/** A06: one row per reported item and member, oldest first. */
export function ReportsQueue({ api }: { api: ReportsApi }) {
  const { t, language } = useLanguage();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.queue().then(
      (loaded) => live && setCases(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  return (
    <>
      <ScreenTitle>{t.adminNavReports}</ScreenTitle>
      {failed ? (
        <ErrorState
          message={t.adminReportsLoadFailed}
          onRetry={() => {
            setFailed(false);
            setCases(null);
            setAttempt((a) => a + 1);
          }}
        />
      ) : !cases ? (
        <LoadingRows />
      ) : cases.length === 0 ? (
        <EmptyState title={t.reportsEmptyTitle} message={t.reportsEmptyMessage} />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
          {cases.map((c) => (
            <li key={c.reportId}>
              <Link
                href={`/reports/${c.reportId}`}
                className="flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold text-foreground">
                    {c.reference} · {c.subjectName}
                  </span>
                  <span className="text-[13px] text-ink-2">
                    {c.targetType === "profile" ? t.targetProfile : t.targetThread} ·{" "}
                    {c.reasons.map((r) => reasonText(t, r)).join(", ")} ·{" "}
                    {t.caseReportCount(c.reportCount)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {c.underReview ? (
                    <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-text">
                      {t.caseUnderReview}
                    </span>
                  ) : null}
                  <span className="text-[13px] text-ink-2">
                    {formatDate(c.firstReportedAt, language)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReportsCard({ detail }: { detail: CaseDetail }) {
  const { t, language } = useLanguage();
  return (
    <Card title={t.caseReportsTitle}>
      <ul className="flex flex-col divide-y">
        {detail.reports.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 py-2 text-sm">
            <span className="font-semibold text-foreground">
              {r.reference} · {reasonText(t, r.reason)}
            </span>
            <span className="text-ink-2">
              {t.reportedBy(r.reporterName)} · {formatDate(r.reportedAt, language)}
            </span>
            {r.note ? <p className="whitespace-pre-wrap text-foreground">{r.note}</p> : null}
            {r.screenshotUrl ? (
              <a
                href={r.screenshotUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline"
              >
                {t.openScreenshot}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ConversationCard({ messages }: { messages: NonNullable<CaseDetail["messages"]> }) {
  const { t, language } = useLanguage();
  return (
    <Card title={t.conversationTitle}>
      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-sm ${m.fromSubject ? "bg-bad-soft" : "bg-surface-2"}`}
          >
            <span className="text-[13px] text-ink-2">
              {m.senderName} · {formatDate(m.sentAt, language)}
            </span>
            {m.deleted ? (
              <span className="italic text-ink-2">{t.messageDeleted}</span>
            ) : (
              <>
                {m.body ? <p className="whitespace-pre-wrap text-foreground">{m.body}</p> : null}
                {m.attachments.map((a) =>
                  a.url ? (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary underline"
                    >
                      {a.fileName}
                    </a>
                  ) : (
                    <span key={a.id}>{a.fileName}</span>
                  ),
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type StateChange = "lift" | "reinstate";

function MemberCard({ subject, api }: { subject: Subject; api: ReportsApi }) {
  const { t } = useLanguage();
  const [paused, setPaused] = useState(subject.postingPaused);
  const [suspended, setSuspended] = useState(subject.suspended);
  const [changing, setChanging] = useState<StateChange | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (kind: StateChange) => {
    if (changing !== kind) {
      setChanging(kind);
      setNote("");
      setProblem(null);
      setDone(null);
      return;
    }
    if (!note.trim()) return setProblem(t.staffNoteRequired);
    setBusy(true);
    const result =
      kind === "lift"
        ? await api.liftPostingPause(subject.id, note.trim())
        : await api.reinstate(subject.id, note.trim());
    setBusy(false);
    if (result !== "done") return setProblem(problemText(t, result));
    if (kind === "lift") setPaused(false);
    else setSuspended(false);
    setChanging(null);
    setDone(kind === "lift" ? t.postingPauseLifted : t.accountReinstated);
  };

  const states = [suspended ? t.stateSuspended : null, paused ? t.statePostingPaused : null].filter(
    Boolean,
  );

  return (
    <Card title={t.reportedMember}>
      <dl className="flex flex-col gap-2">
        <Row label={subject.name} value={`@${subject.username}`} />
        {subject.headline ? <Row label="" value={subject.headline} /> : null}
        <Row label={t.memberStateLabel} value={states.join(" · ") || t.stateActive} />
      </dl>
      <p className="text-sm text-ink-2">{t.upheldLastYear(subject.upheldLastYear)}</p>
      {changing ? (
        <Field id="state-note" label={t.liftNoteLabel} value={note} onChange={setNote} multiline />
      ) : null}
      <Notice tone="bad" text={problem} />
      <Notice tone="good" text={done} />
      <div className="flex flex-wrap gap-2">
        {paused ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => change("lift")}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.liftPostingPause}
          </button>
        ) : null}
        {suspended ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => change("reinstate")}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.reinstateAccount}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

function DecisionCard({
  reportId,
  subject,
  api,
  onDecided,
}: {
  reportId: string;
  subject: Subject;
  api: ReportsApi;
  onDecided: () => void;
}) {
  const { t } = useLanguage();
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const step = action ? automaticStep(subject, action) : null;

  const send = async () => {
    if (!action) return;
    if (!note.trim()) return setProblem(t.staffNoteRequired);
    if (action !== "no_action" && !message.trim()) return setProblem(t.memberMessageRequired);
    setBusy(true);
    const result = await api.decide(reportId, action, note.trim(), message.trim());
    setBusy(false);
    if (result === "done") return onDecided();
    setProblem(problemText(t, result));
  };

  return (
    <Card title={t.decisionTitle}>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(actionLabel) as ModerationAction[]).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={action === a}
            onClick={() => {
              setAction(a);
              setProblem(null);
            }}
            className={buttonVariants({
              variant:
                action === a ? (a.startsWith("suspend") ? "destructive" : "default") : "outline",
            })}
          >
            {t[actionLabel[a]] as string}
          </button>
        ))}
      </div>
      {action ? (
        <>
          <Field
            id="staff-note"
            label={t.staffNoteLabel}
            value={note}
            onChange={setNote}
            multiline
          />
          {action !== "no_action" ? (
            <>
              <Field
                id="member-message"
                label={t.memberMessageLabel}
                value={message}
                onChange={setMessage}
                multiline
              />
              <p className="text-[13px] text-ink-2">{t.memberMessageHint}</p>
            </>
          ) : null}
          {step ? (
            <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm font-medium text-warn-text">
              {step === "pause" ? t.automaticPause : t.automaticSuspend}
            </p>
          ) : null}
          <Notice tone="bad" text={problem} />
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className={buttonVariants({
                variant: action.startsWith("suspend") ? "destructive" : "default",
              })}
            >
              {t.confirmDecision}
            </button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** A07: the reports on one item, the member, the reported conversation and the decision. */
export function ReportDetail({ id, api }: { id: string; api: ReportsApi }) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<CaseDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    let live = true;
    api.detail(id).then(
      (loaded) => {
        if (!live) return;
        setDetail(loaded);
        if (loaded?.open) void api.startReview(id).catch(() => undefined);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, id, attempt]);

  if (failed)
    return (
      <ErrorState
        message={t.adminReportsLoadFailed}
        onRetry={() => {
          setFailed(false);
          setDetail(undefined);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (detail === undefined) return <LoadingRows />;
  if (detail === null)
    return (
      <>
        <ScreenTitle>{t.reportDetailTitle}</ScreenTitle>
        <EmptyState title={t.reportNotFound} message="" />
      </>
    );

  return (
    <>
      <ScreenTitle>{t.reportDetailTitle}</ScreenTitle>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-ink-2">
          {detail.targetType === "profile" ? t.targetProfile : t.targetThread}
        </p>
        <ReportsCard detail={detail} />
        <MemberCard subject={detail.subject} api={api} />
        {detail.messages ? <ConversationCard messages={detail.messages} /> : null}
        {decided ? (
          <Notice tone="good" text={t.caseDecided} />
        ) : detail.open ? (
          <DecisionCard
            reportId={id}
            subject={detail.subject}
            api={api}
            onDecided={() => setDecided(true)}
          />
        ) : (
          <p className="text-sm font-semibold text-ink-2">{t.caseClosed}</p>
        )}
      </div>
    </>
  );
}

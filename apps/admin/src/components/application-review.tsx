"use client";

import {
  categoryFields,
  formatDate,
  type CategoryDetails,
  type IdType,
  type MemberCategory,
  type Strings,
  type TextKey,
} from "@kingdom-connect/shared";
import { Check, ChevronLeft, Clock, Eye, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ageText } from "@/lib/age";
import { useLanguage } from "@/lib/language";
import type { ReopenResult } from "@kingdom-connect/shared";
import type { Application, RejectionReason, VerificationApi } from "@/lib/verification";
import { Card, Notice, Photo, Row } from "./cards";
import { Field } from "./field";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const idTypeLabel: Record<IdType, TextKey> = {
  nida: "idNida",
  passport: "idPassport",
  driving_licence: "idDrivingLicence",
  voters_id: "idVotersId",
};

const categoryLabel: Record<MemberCategory, TextKey> = {
  professional: "categoryProfessional",
  businessperson: "categoryBusinessperson",
  entrepreneur: "categoryEntrepreneur",
  other: "categoryOther",
};

const detailLabel: Record<keyof CategoryDetails, TextKey> = {
  profession: "profession",
  certifications: "certificationsLabel",
  businessName: "businessName",
  sectorId: "sector",
  building: "building",
  description: "describeYourself",
};

const tanzaniaDate = (at: Date) =>
  new Date(at.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

function CheckRow({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3.5 py-4">
      {done ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-good-soft text-good">
          <Check size={15} aria-hidden />
        </span>
      ) : (
        <span aria-hidden className="size-7 shrink-0 rounded-full border-2 border-line-2" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-bold text-foreground">{title}</span>
        <div className="text-[15px] text-ink-2">{children}</div>
      </div>
    </li>
  );
}

function IdentityCard({
  app,
  api,
  today,
}: {
  app: Application;
  api: VerificationApi;
  today: Date;
}) {
  const { t } = useLanguage();
  const [idNumber, setIdNumber] = useState<string | null>(null);
  const [revealFailed, setRevealFailed] = useState(false);
  const expired = app.idExpiresOn !== null && app.idExpiresOn < tanzaniaDate(today);

  const reveal = async () => {
    const number = await api.revealIdNumber(app.memberId);
    setRevealFailed(number === null);
    setIdNumber(number);
  };

  const idType = app.idType ? t[idTypeLabel[app.idType]] : t.notGiven;
  return (
    <Card title={t.reviewWhatYouCheck}>
      <p className="-mt-2 text-sm text-ink-2">{t.reviewCheckHint}</p>
      <ul className="flex flex-col divide-y border-t">
        <CheckRow done={false} title={t.reviewCheckName}>
          {t.reviewOnTheForm(app.fullName)}
        </CheckRow>
        <CheckRow done={false} title={t.reviewCheckIdNumber}>
          {idNumber ? (
            <span className="font-mono text-foreground">{idNumber}</span>
          ) : (
            <span className="flex flex-col items-start gap-2">
              <span>
                {idType} · {t.reviewIdHidden}
              </span>
              <button
                type="button"
                onClick={reveal}
                className="flex min-h-[40px] items-center gap-2 rounded-full border border-line-2 bg-card px-4 text-sm font-semibold text-foreground hover:bg-surface-2"
              >
                <Eye size={15} aria-hidden />
                {t.revealIdNumber}
              </button>
              <span className="text-xs">{t.revealLogged}</span>
            </span>
          )}
        </CheckRow>
        <CheckRow done={false} title={t.reviewCheckFace}>
          {t.reviewCompareAbove}
        </CheckRow>
        <CheckRow done={app.idExpiresOn !== null && !expired} title={t.reviewCheckExpiry}>
          {app.idExpiresOn ? t.reviewExpiresOn(app.idExpiresOn) : t.notGiven}
        </CheckRow>
        <CheckRow done={app.phone.startsWith("+255")} title={t.reviewCheckLocation}>
          {t.reviewLocationLine(app.phone, [app.district, app.region].filter(Boolean).join(", "))}
        </CheckRow>
      </ul>
      <Notice tone="bad" text={revealFailed ? t.revealFailed : null} />
      <Notice tone="warn" text={expired ? t.reviewIdExpired : null} />
    </Card>
  );
}

function DuplicateCard({
  app,
  api,
  onChanged,
}: {
  app: Application;
  api: VerificationApi;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const mark = async (value: string) => {
    const result = await api.markDuplicate(app.id, value);
    if (result.kind === "done") {
      setUsername("");
      setProblem(null);
      onChanged();
    } else if (result.kind === "unknown_member") setProblem(t.unknownUsername);
    else if (result.kind === "already_decided") setProblem(t.alreadyDecided);
    else setProblem(t.decideFailed);
  };

  if (!app.duplicate && !app.pending) return null;
  return (
    <Card title={t.reviewDuplicateTitle}>
      {app.duplicate ? (
        <>
          <Notice tone="warn" text={t.reviewDuplicateOf(app.duplicate.username)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Photo label={t.reviewFacePhoto} url={app.facePhotoUrl} />
            <Photo
              label={t.reviewFacePhotoOf(app.duplicate.username)}
              url={app.duplicate.facePhotoUrl}
            />
          </div>
        </>
      ) : null}
      {app.pending ? (
        <div className="flex flex-col gap-2">
          <Field
            id="duplicate-username"
            label={t.markDuplicateLabel}
            value={username}
            onChange={setUsername}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!username.trim()}
              onClick={() => mark(username)}
              className="min-h-[44px] rounded-full border border-line-2 bg-card px-5 text-sm font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              {t.markDuplicate}
            </button>
            {app.duplicate ? (
              <button
                type="button"
                onClick={() => mark("")}
                className={buttonVariants({ variant: "ghost" })}
              >
                {t.clearDuplicate}
              </button>
            ) : null}
          </div>
          <Notice tone="bad" text={problem} />
        </div>
      ) : null}
    </Card>
  );
}

function ProfileCard({ app }: { app: Application }) {
  const { t } = useLanguage();
  const study = [app.study.institution, app.study.course, app.study.year?.toString()]
    .filter(Boolean)
    .join(", ");
  return (
    <Card title={t.reviewFromApplication}>
      <dl className="flex flex-col gap-3 border-t pt-3">
        <Row label={t.reviewUsername} value={`@${app.username}`} />
        <Row
          label={t.reviewCategory}
          value={
            app.categories.length > 0
              ? app.categories.map((c) => t[categoryLabel[c]]).join(", ")
              : t.notGiven
          }
        />
        {[
          ...new Set(app.categories.flatMap((c) => categoryFields[c].map(({ field }) => field))),
        ].map((field) => (
          <Row
            key={field}
            label={t[detailLabel[field]] as string}
            value={
              (field === "sectorId" ? app.sectorName : app.categoryDetails[field]) || t.notGiven
            }
          />
        ))}
        <Row label={t.region} value={app.region} />
        <Row label={t.district} value={app.district} />
        <Row label={t.addressLabel} value={app.address} />
        <Row label={t.reviewPhone} value={app.phone} />
        <Row label={t.reviewEmail} value={app.email} />
        <Row label={t.reviewStudy} value={study || t.notGiven} />
      </dl>
    </Card>
  );
}

type Outcome = "approved" | "rejected" | null;

function DecisionCard({
  app,
  api,
  onDecided,
}: {
  app: Application;
  api: VerificationApi;
  onDecided: (outcome: Exclude<Outcome, null>) => void;
}) {
  const { t, language } = useLanguage();
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.reasons(language).then(setReasons, () => setProblem(t.decideFailed));
  }, [api, language, t]);

  const chosen = reasons.find((r) => r.code === code);

  const send = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && (!chosen || (chosen.needsNote && !note.trim()))) {
      setProblem(t.reasonRequired);
      return;
    }
    setBusy(true);
    const result = await api.decide(
      decision === "approved"
        ? { requestId: app.id, decision }
        : { requestId: app.id, decision, reasonCode: chosen!.code, note: note.trim() },
    );
    setBusy(false);
    if (result.kind === "done") return onDecided(decision);
    setProblem(
      {
        already_decided: t.alreadyDecided,
        reason_required: t.reasonRequired,
        note_has_contact_details: t.noteHasContact,
        member_not_pending: t.memberNotPending,
        failed: t.decideFailed,
      }[result.kind],
    );
  };

  return (
    <section className="flex flex-col gap-4 rounded-[22px] border-2 border-primary bg-card px-6 py-6 shadow-card">
      <h2 className="text-[17px] font-bold text-foreground">{t.reviewDecision}</h2>
      <button
        type="button"
        disabled={busy}
        onClick={() => send("approved")}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-good px-5 text-[16px] font-bold text-white disabled:opacity-50"
      >
        <Check size={18} aria-hidden />
        {t.approve}
      </button>
      <div className="flex flex-col gap-1.5 border-t pt-4">
        <label htmlFor="reject-reason" className="text-sm font-semibold text-foreground">
          {t.rejectReason}
        </label>
        <select
          id="reject-reason"
          value={code ?? ""}
          onChange={(e) => setCode(e.target.value || null)}
          className="min-h-[52px] rounded-full border border-field bg-card px-5 text-[15px] text-foreground"
        >
          <option value="">{t.rejectChooseReason}</option>
          {reasons.map((reason) => (
            <option key={reason.code} value={reason.code}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>
      <Field
        id="reject-note"
        label={chosen?.needsNote ? t.rejectNoteNeeded : t.rejectNote}
        value={note}
        onChange={setNote}
        multiline
      />
      <Notice tone="bad" text={problem} />
      <button
        type="button"
        disabled={busy}
        onClick={() => send("rejected")}
        className="min-h-[50px] rounded-full border-2 border-bad-text bg-card px-5 text-[15px] font-bold text-bad-text disabled:opacity-50"
      >
        {t.rejectSend}
      </button>
      <p className="text-[13px] leading-[18px] text-ink-2">{t.rejectLanguageNote}</p>
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <Lock size={14} aria-hidden />
        {t.reviewAuditNote}
      </p>
    </section>
  );
}

function outcomeText(t: Strings, outcome: Outcome, app: Application): string | null {
  if (outcome === "approved") return t.decidedApproved;
  if (outcome === "rejected") return t.decidedRejected;
  if (app.decision?.status === "approved") return t.decisionApproved;
  if (app.decision?.status === "rejected") return t.decisionRejected(app.decision.reason);
  return app.pending ? null : t.applicationDecided;
}

function ReopenCard({ app, api }: { app: Application; api: VerificationApi }) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ReopenResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reopen = async () => {
    if (!note.trim()) return setResult("note_required");
    setBusy(true);
    setResult(await api.reopen(app.id, note.trim()));
    setBusy(false);
  };

  if (result === "done") return <Notice tone="good" text={t.reopened} />;
  return (
    <section className="flex flex-col gap-3 rounded-[22px] border bg-card px-6 py-6 shadow-card">
      <p className="text-sm text-ink-2">{t.decisionFinal}</p>
      <Field id="reopen-note" label={t.reopenNote} value={note} onChange={setNote} multiline />
      <Notice
        tone="bad"
        text={
          result === "note_required"
            ? t.reopenNoteRequired
            : result === "not_final"
              ? t.reopenNotFinal
              : result === "failed"
                ? t.reopenFailed
                : null
        }
      />
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={reopen}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.reopen}
        </button>
      </div>
    </section>
  );
}

export function ApplicationReview({
  id,
  api,
  today = new Date(),
}: {
  id: string;
  api: VerificationApi;
  today?: Date;
}) {
  const { t, language } = useLanguage();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.application(id, language).then(
      (loaded) => live && setApp(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, id, language, attempt]);

  const reload = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };

  const back = (
    <Link
      href="/verification"
      className="flex items-center gap-1.5 self-start text-[15px] font-semibold text-primary underline"
    >
      <ChevronLeft size={16} aria-hidden />
      {t.reviewBack}
    </Link>
  );

  if (failed) return <ErrorState message={t.applicationLoadFailed} onRetry={reload} />;
  if (app === undefined) return <LoadingRows />;
  if (app === null)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState title={t.reviewTitle} message={t.applicationNotFound} />
      </div>
    );

  const done = outcomeText(t, outcome, app);
  const open = app.pending && !outcome;

  const name = app.fullName || t.reviewTitle;
  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex items-center gap-4">
        {app.facePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.facePhotoUrl}
            alt=""
            className="size-16 shrink-0 rounded-full border-2 border-card object-cover shadow-card"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-16 shrink-0 place-items-center rounded-full bg-blue-soft text-xl font-bold text-primary"
          >
            {name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]!.toUpperCase())
              .join("")}
          </span>
        )}
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[30px] leading-9 font-extrabold tracking-tight text-primary">
            {name}
          </h1>
          <div className="flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-warn-text">
              {t.reviewMemberApplication}
            </span>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-ink-2">
              {t.reviewSubmittedOn(formatDate(app.submittedAt, language))}
            </span>
            {app.pending ? (
              <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-0.5 text-warn-text">
                <Clock size={12} aria-hidden />
                {t.reviewWaited(ageText(t, app.submittedAt, today))}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <Notice tone={outcome || app.decision?.status === "approved" ? "good" : "warn"} text={done} />
      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-[22px] border bg-card px-6 py-6 shadow-card">
            <h2 className="text-[17px] font-bold text-foreground">{t.reviewPhotosTitle}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Photo label={t.reviewFacePhoto} url={app.facePhotoUrl} />
              <Photo label={t.reviewIdPhoto} url={app.idPhotoUrl} />
            </div>
            <p className="text-[13px] text-ink-2">{t.reviewPhotosPrivate}</p>
          </section>
          <IdentityCard app={app} api={api} today={today} />
          <DuplicateCard app={{ ...app, pending: open }} api={api} onChanged={reload} />
        </div>
        <div className="flex flex-col gap-4">
          {open ? <DecisionCard app={app} api={api} onDecided={setOutcome} /> : null}
          {app.decision?.status === "rejected" && app.decision.final ? (
            <ReopenCard app={app} api={api} />
          ) : null}
          <ProfileCard app={app} />
        </div>
      </div>
    </div>
  );
}

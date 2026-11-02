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
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import type { Application, RejectionReason, VerificationApi } from "@/lib/verification";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  );
}

function Photo({ label, url }: { label: string; url: string | null }) {
  const { t } = useLanguage();
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-foreground">{label}</figcaption>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          className="aspect-[4/3] w-full rounded-lg border bg-surface-2 object-contain"
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-surface-2 text-sm text-ink-2">
          {t.photoMissing}
        </div>
      )}
    </figure>
  );
}

function Notice({ tone, text }: { tone: "good" | "warn" | "bad"; text: string | null }) {
  if (!text) return null;
  const colours = {
    good: "bg-good-soft text-good-text",
    warn: "bg-warn-soft text-warn-text",
    bad: "bg-bad-soft text-bad-text",
  }[tone];
  return (
    <div
      role={tone === "good" ? "status" : "alert"}
      className={`rounded-lg px-4 py-3 text-sm font-medium ${colours}`}
    >
      {text}
    </div>
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

  return (
    <Card title={t.reviewIdentity}>
      <p className="text-sm text-ink-2">{t.reviewCheckHint}</p>
      <dl className="flex flex-col gap-2">
        <Row label={t.reviewNameOnForm} value={app.fullName} />
        <Row label={t.idType} value={app.idType ? t[idTypeLabel[app.idType]] : t.notGiven} />
        <Row
          label={t.idNumber}
          value={
            idNumber ? (
              <span className="font-mono">{idNumber}</span>
            ) : (
              <span className="flex flex-col items-start gap-1.5">
                <span className="text-ink-2">{t.reviewIdHidden}</span>
                <button
                  type="button"
                  onClick={reveal}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {t.revealIdNumber}
                </button>
                <span className="text-xs text-ink-2">{t.revealLogged}</span>
              </span>
            )
          }
        />
        <Row label={t.reviewIdExpires} value={app.idExpiresOn ?? t.notGiven} />
      </dl>
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
    <Card title={t.suspectedDuplicate}>
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
              className={buttonVariants({ variant: "outline" })}
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
    <Card title={t.reviewProfile}>
      <dl className="flex flex-col gap-2">
        <Row label={t.reviewUsername} value={`@${app.username}`} />
        <Row
          label={t.reviewCategory}
          value={app.category ? t[categoryLabel[app.category]] : t.notGiven}
        />
        {app.category
          ? categoryFields[app.category].map(({ field }) => (
              <Row
                key={field}
                label={t[detailLabel[field]] as string}
                value={
                  (field === "sectorId" ? app.sectorName : app.categoryDetails[field]) || t.notGiven
                }
              />
            ))
          : null}
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
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rejecting) api.reasons(language).then(setReasons, () => setProblem(t.decideFailed));
  }, [rejecting, api, language, t]);

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
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      {rejecting ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-foreground">{t.rejectReason}</legend>
            {reasons.map((reason) => (
              <label key={reason.code} className="flex min-h-[40px] items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="reason"
                  value={reason.code}
                  checked={code === reason.code}
                  onChange={() => setCode(reason.code)}
                  className="size-4 accent-[var(--kc-blue)]"
                />
                {reason.label}
              </label>
            ))}
          </fieldset>
          <Field
            id="reject-note"
            label={chosen?.needsNote ? t.rejectNoteNeeded : t.rejectNote}
            value={note}
            onChange={setNote}
            multiline
          />
          <Notice tone="bad" text={problem} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => send("rejected")}
              className={buttonVariants({ variant: "destructive" })}
            >
              {t.rejectSend}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setProblem(null);
              }}
              className={buttonVariants({ variant: "ghost" })}
            >
              {t.cancel}
            </button>
          </div>
        </>
      ) : (
        <>
          <Notice tone="bad" text={problem} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => send("approved")}
              className={buttonVariants({ variant: "default" })}
            >
              {t.approve}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(true);
                setProblem(null);
              }}
              className={buttonVariants({ variant: "outline" })}
            >
              {t.reject}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function outcomeText(t: Strings, outcome: Outcome, pending: boolean): string | null {
  if (outcome === "approved") return t.decidedApproved;
  if (outcome === "rejected") return t.decidedRejected;
  return pending ? null : t.applicationDecided;
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
    <Link href="/verification" className="text-sm font-semibold text-blue">
      ‹ {t.reviewBack}
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

  const done = outcomeText(t, outcome, app.pending);
  const open = app.pending && !outcome;

  return (
    <div className="flex flex-col gap-4">
      {back}
      <div>
        <ScreenTitle>{app.fullName || t.reviewTitle}</ScreenTitle>
        <p className="-mt-3 text-sm text-ink-2">
          {t.reviewSubmittedOn(formatDate(app.submittedAt, language))}
        </p>
      </div>
      <Notice tone={outcome ? "good" : "warn"} text={done} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Photo label={t.reviewFacePhoto} url={app.facePhotoUrl} />
        <Photo label={t.reviewIdPhoto} url={app.idPhotoUrl} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IdentityCard app={app} api={api} today={today} />
        <ProfileCard app={app} />
      </div>
      <DuplicateCard app={{ ...app, pending: open }} api={api} onChanged={reload} />
      {open ? <DecisionCard app={app} api={api} onDecided={setOutcome} /> : null}
    </div>
  );
}

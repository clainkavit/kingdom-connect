"use client";

import { formatDate, type Strings, type TextKey } from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import type {
  BusinessDecision,
  BusinessReason,
  BusinessReviewApi,
  BusinessReviewData,
} from "@/lib/business-review";
import { Card, Notice, Photo, Row } from "./cards";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const sizeLabel: Record<BusinessReviewData["size"], TextKey> = {
  micro: "sizeMicro",
  small: "sizeSmall",
  medium: "sizeMedium",
  large: "sizeLarge",
};

const documentLabel = {
  brela: "docBrela",
  tin: "docTin",
  licence: "docLicence",
  directorship: "docDirectorship",
  authorisation_letter: "docAuthorisation",
  address_proof: "docAddressProof",
} as const;

function decisionProblem(t: Strings, result: BusinessDecision): string | null {
  return {
    ok: null,
    already_decided: t.alreadyDecided,
    reason_required: t.reasonRequired,
    note_has_contact_details: t.noteHasContact,
    not_found: t.businessNotFound,
    failed: t.decideFailed,
  }[result];
}

function DecisionCard({
  data,
  api,
  onDecided,
}: {
  data: BusinessReviewData;
  api: BusinessReviewApi;
  onDecided: (approved: boolean) => void;
}) {
  const { t, language } = useLanguage();
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<BusinessReason[]>([]);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rejecting)
      api.reasons(language, data.level).then(setReasons, () => setProblem(t.decideFailed));
  }, [rejecting, api, language, t, data.level]);

  const chosen = reasons.find((r) => r.code === code);

  const decide = async (approve: boolean) => {
    if (!approve && (!chosen || (chosen.needsNote && !note.trim()))) {
      setProblem(t.reasonRequired);
      return;
    }
    setBusy(true);
    const result = await api.decide(data.id, approve, code, note).catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") return onDecided(approve);
    setProblem(decisionProblem(t, result));
  };

  return (
    <Card title={data.level === 3 ? t.posterReviewTitle : t.businessReviewTitle}>
      {rejecting ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-foreground">{t.rejectReason}</legend>
            {reasons.map((reason) => (
              <label key={reason.code} className="flex min-h-[40px] items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="business-reason"
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
            id="business-note"
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
              onClick={() => decide(false)}
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
              onClick={() => decide(true)}
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
    </Card>
  );
}

/** Level 2 and Level 3 business verification: the details and the documents, then approve or reject. */
export function BusinessReview({ id, api }: { id: string; api: BusinessReviewApi }) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<BusinessReviewData | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    let live = true;
    api.load(id).then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, id, attempt]);

  if (failed)
    return (
      <ErrorState
        message={t.applicationLoadFailed}
        onRetry={() => {
          setFailed(false);
          setData(undefined);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (data === undefined) return <LoadingRows />;
  if (data === null)
    return (
      <>
        <ScreenTitle>{t.businessReviewTitle}</ScreenTitle>
        <EmptyState title={t.businessNotFound} message="" />
      </>
    );

  const title = data.level === 3 ? t.posterReviewTitle : t.businessReviewTitle;

  return (
    <>
      <ScreenTitle>{title}</ScreenTitle>
      <div className="flex flex-col gap-4">
        <Link href="/verification" className="text-sm font-semibold text-primary underline">
          {t.reviewBack}
        </Link>
        <Card title={data.name}>
          <dl className="flex flex-col gap-2">
            <Row
              label={t.businessOwner}
              value={`${data.ownerName || data.ownerUsername} · @${data.ownerUsername}`}
            />
            <Row label={t.businessSector} value={data.sector[language]} />
            <Row label={t.businessSize} value={t[sizeLabel[data.size]] as string} />
            {data.description ? (
              <Row label={t.businessDescription} value={data.description} />
            ) : null}
            <Row label={t.brelaNumber} value={data.brelaNo} />
            {data.level === 3 ? (
              <>
                <Row label={t.businessAddress} value={data.address} />
                {data.region ? <Row label={t.region} value={data.region[language]} /> : null}
                {data.district ? <Row label={t.district} value={data.district[language]} /> : null}
                {data.proofKind ? (
                  <Row
                    label={t.posterProofKind}
                    value={t[documentLabel[data.proofKind]] as string}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Row label={t.tinNumber} value={data.tin} />
                <Row label={t.licenceNumber} value={data.licenceNo} />
                <Row label={t.licenceExpiry} value={data.licenceExpiresOn} />
              </>
            )}
          </dl>
          <p className="text-[13px] text-ink-2">
            {t.reviewSubmittedOn(formatDate(data.submittedAt, language))}
          </p>
        </Card>
        <div className="grid gap-3 min-[881px]:grid-cols-3">
          {data.documents.map((d) => {
            const label = t[documentLabel[d.kind]] as string;
            return d.isPdf ? (
              <Card key={d.kind} title={label}>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline"
                  >
                    {t.openDocument(label)}
                  </a>
                ) : (
                  <p className="text-sm text-ink-2">{t.photoMissing}</p>
                )}
              </Card>
            ) : (
              <Photo key={d.kind} label={label} url={d.url} />
            );
          })}
        </div>
        {outcome ? (
          <Notice
            tone="good"
            text={outcome === "approved" ? t.businessDecidedApproved : t.businessDecidedRejected}
          />
        ) : data.pending ? (
          <DecisionCard
            data={data}
            api={api}
            onDecided={(approved) => setOutcome(approved ? "approved" : "rejected")}
          />
        ) : (
          <Notice
            tone={data.status === "approved" ? "good" : "warn"}
            text={
              data.status === "approved"
                ? t.decisionApproved
                : t.decisionRejected(data.reason ?? "")
            }
          />
        )}
      </div>
    </>
  );
}

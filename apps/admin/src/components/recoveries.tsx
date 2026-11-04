"use client";

import { formatDate, type Strings } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import type { DecideRecoveryResult, RecoveriesApi, Recovery } from "@/lib/recoveries";
import { Card, Notice, Photo } from "./cards";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function decisionProblem(t: Strings, result: DecideRecoveryResult): string | null {
  return {
    ok: null,
    already_decided: t.caseAlreadyDecided,
    no_photo: t.recoveryInvalid,
    filed_by_you: t.recoveryFiledByYou,
    reason_required: t.staffNoteRequired,
    failed: t.decideFailed,
  }[result];
}

function RecoveryCard({ recovery, api }: { recovery: Recovery; api: RecoveriesApi }) {
  const { t, language } = useLanguage();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const result = await api.decide(recovery.id, approve, reason).catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") return setDone(true);
    setProblem(decisionProblem(t, result));
  };

  return (
    <Card title={`${recovery.fullName || recovery.username} · @${recovery.username}`}>
      <p className="text-sm text-foreground">
        {recovery.newEmail} · {formatDate(recovery.requestedAt, language)}
        {recovery.filedByStaff ? ` · ${t.recoveryFiledByStaff}` : ""}
      </p>
      <Notice
        tone={recovery.digitsMatch ? "good" : "bad"}
        text={recovery.digitsMatch ? t.recoveryDigitsMatch : t.recoveryDigitsDiffer}
      />
      <div className="grid gap-3 min-[881px]:grid-cols-3">
        <Photo label={t.recoveryPhotoOnFile} url={recovery.facePhotoUrl} />
        <Photo label={t.recoveryIdOnFile} url={recovery.idPhotoUrl} />
        <Photo label={t.recoveryNewPhoto} url={recovery.newPhotoUrl} />
      </div>
      {done ? (
        <Notice tone="good" text={t.recoveryDecided} />
      ) : recovery.filedByMe ? (
        <p className="text-sm text-ink-2">{t.recoveryFiledByYou}</p>
      ) : (
        <>
          {refusing ? (
            <Field
              id={`reason-${recovery.id}`}
              label={t.recoveryRefuseReason}
              value={reason}
              onChange={setReason}
              multiline
            />
          ) : null}
          <Notice tone="bad" text={problem} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(true)}
              className={buttonVariants({ variant: "default" })}
            >
              {t.recoveryApprove}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (refusing ? decide(false) : setRefusing(true))}
              className={buttonVariants({ variant: "outline" })}
            >
              {t.recoveryRefuse}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function FileForm({ api }: { api: RecoveriesApi }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [digits, setDigits] = useState("");
  const [photo, setPhoto] = useState<{ base64: string; mime: string } | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES)
      return setMessage({ tone: "bad", text: t.recoveryPhotoTooLarge });
    const reader = new FileReader();
    reader.onload = () =>
      setPhoto({ base64: String(reader.result).split(",")[1] ?? "", mime: file.type });
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!username.trim() || !newEmail.trim() || !/^\d{4}$/.test(digits) || !photo)
      return setMessage({ tone: "bad", text: t.recoveryInvalid });
    const result = await api.file({
      username: username.trim(),
      newEmail: newEmail.trim(),
      lastDigits: digits,
      photo: photo.base64,
      mime: photo.mime,
    });
    setMessage(
      result === "sent"
        ? { tone: "good", text: t.recoveryFiled }
        : { tone: "bad", text: result === "invalid" ? t.recoveryInvalid : t.recoveryFailed },
    );
  };

  return (
    <Card title={t.recoveryFileTitle}>
      <p className="text-sm text-ink-2">{t.recoveryFileHint}</p>
      <div className="grid gap-3 min-[881px]:grid-cols-3">
        <Field
          id="file-username"
          label={t.recoveryUsername}
          value={username}
          onChange={setUsername}
        />
        <Field id="file-email" label={t.recoveryNewEmail} value={newEmail} onChange={setNewEmail} />
        <Field
          id="file-digits"
          label={t.recoveryDigits}
          value={digits}
          onChange={(v) => setDigits(v.replace(/\D/g, "").slice(0, 4))}
        />
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
        {t.recoveryNewPhoto}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      <Notice tone={message?.tone ?? "good"} text={message?.text ?? null} />
      <div>
        <button type="button" onClick={submit} className={buttonVariants({ variant: "outline" })}>
          {t.recoverySend}
        </button>
      </div>
    </Card>
  );
}

/** Email recovery requests (R08c): compare the new face photo with the ID and face photo on file. */
export function RecoveriesScreen({ api }: { api: RecoveriesApi }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<Recovery[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.pending().then(
      (loaded) => live && setItems(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  return (
    <>
      <ScreenTitle>{t.adminNavRecoveries}</ScreenTitle>
      <div className="flex flex-col gap-4">
        {failed ? (
          <ErrorState
            message={t.recoveriesLoadFailed}
            onRetry={() => {
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
          />
        ) : !items ? (
          <LoadingRows />
        ) : items.length === 0 ? (
          <EmptyState title={t.recoveriesEmptyTitle} message={t.recoveriesEmptyMessage} />
        ) : (
          items.map((r) => <RecoveryCard key={r.id} recovery={r} api={api} />)
        )}
        <FileForm api={api} />
      </div>
    </>
  );
}

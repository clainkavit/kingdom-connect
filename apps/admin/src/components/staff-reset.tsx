"use client";

import {
  passwordProblem,
  routePaths,
  type FinishResetResult,
  type ResetLinkCheck,
} from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { Field } from "./field";
import { Message, primaryButton } from "./login-forms";

const backLink = "self-start text-sm font-semibold text-primary underline underline-offset-2";

/** Admin-Forgot (R30): the form. Once sent, the page shows Admin-ForgotSent. */
export function StaffForgotForm({
  requestReset,
  onSent,
}: {
  requestReset: (email: string) => Promise<boolean>;
  onSent: () => void;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    const ok = await requestReset(email.trim());
    setBusy(false);
    if (ok) onSent();
    else setFailed(true);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        id="email"
        label={t.email}
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
      />
      <Message text={failed ? t.actionFailed : null} />
      <button type="submit" disabled={busy || !email.includes("@")} className={primaryButton}>
        {t.askForReset}
      </button>
      <Link href={routePaths.login} className={`${backLink} mt-2`}>
        {t.backToLogIn}
      </Link>
    </form>
  );
}

/** Admin-ForgotSent: what happens next, the same answer whether or not the email is a staff account. */
export function StaffForgotSent() {
  const { t } = useLanguage();
  const steps = [t.staffResetStep1, t.staffResetStep2, t.staffResetStep3];
  return (
    <>
      <ol className="flex flex-col gap-3 rounded-[18px] border border-line bg-card px-5 py-5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm leading-[1.45] text-foreground">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-warn-soft text-xs font-bold text-primary">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <Link href={routePaths.login} className={`${primaryButton} flex items-center justify-center`}>
        {t.backToLogIn}
      </Link>
    </>
  );
}

export type NewPasswordApi = {
  check: () => Promise<ResetLinkCheck>;
  save: (password: string) => Promise<FinishResetResult>;
};

type Stage =
  { kind: "checking" } | { kind: "invalid" } | { kind: "form"; email: string } | { kind: "done" };

/** Admin-NewPassword (R30): the link a Super Administrator sent. Two matching passwords, saved once. */
export function StaffNewPassword({ api }: { api: NewPasswordApi }) {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.check().then((r) => {
      if (!live) return;
      if (r.kind === "ok") setStage({ kind: "form", email: r.email });
      else if (r.kind === "expired") setStage({ kind: "invalid" });
      else setProblem(t.actionFailed);
    });
    return () => {
      live = false;
    };
  }, [api, t.actionFailed]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordProblem(password)) return setProblem(t.problemPassword);
    if (password !== again) return setProblem(t.passwordsDiffer);
    setBusy(true);
    const result = await api.save(password);
    setBusy(false);
    if (result === "done") return setStage({ kind: "done" });
    if (result === "expired") return setStage({ kind: "invalid" });
    setProblem(result === "weak_password" ? t.problemPassword : t.saveFailed);
  };

  if (stage.kind === "checking") return <Message text={problem} />;
  if (stage.kind === "invalid" || stage.kind === "done")
    return (
      <>
        {stage.kind === "invalid" ? (
          <p role="alert" className="text-sm text-bad-text">
            {t.staffResetLinkInvalid}
          </p>
        ) : (
          <p role="status" className="text-sm text-foreground">
            {t.passwordSet}
          </p>
        )}
        <Link
          href={routePaths.login}
          className={buttonVariants({ variant: stage.kind === "done" ? "default" : "outline" })}
        >
          {t.goToLogin}
        </Link>
      </>
    );
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-[16px] border border-line bg-card px-4 py-3">
        <span className="w-[90px] shrink-0 text-[13px] leading-[1.3] text-ink-2">
          {t.staffAccountFor}
        </span>
        <span className="min-w-0 text-sm font-semibold break-all text-foreground">
          {stage.email}
        </span>
      </div>
      <Field
        id="new-password"
        label={t.newPassword}
        value={password}
        onChange={setPassword}
        type="password"
        placeholder={t.passwordHint}
        autoComplete="new-password"
      />
      <Field
        id="confirm-password"
        label={t.confirmNewPassword}
        value={again}
        onChange={setAgain}
        type="password"
        placeholder={t.repeatPassword}
        autoComplete="new-password"
      />
      <Message text={problem} />
      <button type="submit" disabled={busy || !password || !again} className={primaryButton}>
        {t.saveNewPassword}
      </button>
      <p className="text-[13px] leading-[1.45] text-ink-2">{t.staffNewPasswordNote}</p>
    </form>
  );
}

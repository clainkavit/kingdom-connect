"use client";

import {
  codeMessage,
  loginMessage,
  minutesAndSeconds,
  type LoginClient,
  type Session,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language";
import { Field } from "./field";

function useCountdown(initialSeconds: number) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const restart = (seconds: number) => {
    const t = Date.now();
    setNow(t);
    setEndsAt(t + seconds * 1000);
  };
  return { secondsLeft: Math.max(0, Math.ceil((endsAt - now) / 1000)), restart };
}

const CODE_LENGTH = 6;

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <div className="relative">
      <div data-testid="code-boxes" aria-hidden className="flex gap-1.5">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex min-h-[48px] flex-1 items-center justify-center rounded-[9px] border border-field text-xl font-extrabold text-foreground",
              focused && i === active && "border-primary ring-3 ring-ring/30",
            )}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </div>
      <label htmlFor="code" className="sr-only">
        {t.emailCode}
      </label>
      <input
        id="code"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}

const primaryButton =
  "min-h-[48px] rounded-[10px] bg-primary px-4 text-[15px] font-bold text-primary-foreground disabled:opacity-50";
const secondaryButton =
  "min-h-[44px] rounded-[9px] border bg-card px-4 text-sm font-semibold text-ink-2 disabled:opacity-50";

function Message({ text, tone = "bad" }: { text: string | null; tone?: "bad" | "info" }) {
  if (!text) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-[10px] px-3 py-2.5 text-[13px] leading-[1.45]",
        tone === "info" ? "bg-blue-soft text-info-text" : "bg-bad-soft text-bad-text",
      )}
    >
      {text}
    </p>
  );
}

export function LoginForm({
  client,
  onCodeSent,
}: {
  client: LoginClient;
  onCodeSent: (session: Session, resendAfterSeconds: number) => void;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await client.logIn({ email, password });
    setBusy(false);
    if (result.kind === "code_sent") return onCodeSent(result.session, result.resendAfterSeconds);
    if (result.kind === "locked") return lock.restart(result.retryAfterSeconds);
    setMessage(loginMessage(result, { ...t, invalidLogin: t.invalidStaffLogin }));
  };

  const locked = lock.secondsLeft > 0;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field id="email" label={t.email} value={email} onChange={setEmail} type="email" />
      <Field
        id="password"
        label={t.password}
        value={password}
        onChange={setPassword}
        type="password"
      />
      {locked ? (
        <Message tone="info" text={t.locked(minutesAndSeconds(lock.secondsLeft))} />
      ) : (
        <Message text={message} />
      )}
      <button
        type="submit"
        disabled={busy || locked || !email || !password}
        className={primaryButton}
      >
        {t.logIn}
      </button>
    </form>
  );
}

export function CodeForm({
  client,
  accessToken,
  resendAfterSeconds,
  onVerified,
}: {
  client: LoginClient;
  accessToken: string;
  resendAfterSeconds: number;
  onVerified: () => void;
}) {
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown(resendAfterSeconds);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await client.verifyCode(accessToken, code);
    setBusy(false);
    if (result.kind === "verified") return onVerified();
    setMessage(codeMessage(result, t));
  };

  const sendNew = async () => {
    const result = await client.resendCode(accessToken);
    if (result.kind === "sent") {
      resend.restart(result.resendAfterSeconds);
      setMessage(null);
      setCode("");
    } else if (result.kind === "too_soon") {
      resend.restart(result.retryAfterSeconds);
    } else if (result.kind === "too_many_codes") {
      setMessage(t.tooManyCodes);
    } else {
      setMessage(t.network);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm leading-[1.45] text-ink-2">{t.codeSent}</p>
      <CodeBoxes value={code} onChange={setCode} />
      <Message text={message} />
      <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>
        {t.verify}
      </button>
      <button
        type="button"
        onClick={sendNew}
        disabled={resend.secondsLeft > 0}
        className={secondaryButton}
      >
        {resend.secondsLeft > 0 ? t.resendIn(resend.secondsLeft) : t.resend}
      </button>
    </form>
  );
}

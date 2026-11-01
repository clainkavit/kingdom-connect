"use client";

import type { LoginClient, Session } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { strings } from "@/strings";

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

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-semibold text-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        inputMode={props.numeric ? "numeric" : undefined}
        maxLength={props.numeric ? 6 : undefined}
        autoComplete={props.numeric ? "one-time-code" : undefined}
        className="rounded-lg border bg-card px-3 py-2.5 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-foreground">
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
    if (result.kind === "locked") lock.restart(result.retryAfterSeconds);
    setMessage(
      result.kind === "invalid"
        ? strings.invalidLogin
        : result.kind === "suspended"
          ? strings.suspended
          : result.kind === "network"
            ? strings.network
            : null,
    );
  };

  const locked = lock.secondsLeft > 0;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="email" label={strings.email} value={email} onChange={setEmail} type="email" />
      <Field
        id="password"
        label={strings.password}
        value={password}
        onChange={setPassword}
        type="password"
      />
      <Message text={locked ? strings.locked(mmss(lock.secondsLeft)) : message} />
      <button
        type="submit"
        disabled={busy || locked || !email || !password}
        className={cn(buttonVariants(), "h-10")}
      >
        {strings.logIn}
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
    setMessage(
      result.kind === "wrong_code"
        ? strings.wrongCode(result.attemptsLeft)
        : result.kind === "too_many"
          ? strings.tooManyCodes
          : result.kind === "expired"
            ? strings.codeExpired
            : result.kind === "network"
              ? strings.network
              : strings.noCode,
    );
  };

  const sendNew = async () => {
    const result = await client.resendCode(accessToken);
    if (result.kind === "sent") {
      resend.restart(result.resendAfterSeconds);
      setMessage(null);
      setCode("");
    } else if (result.kind === "too_soon") {
      resend.restart(result.retryAfterSeconds);
    } else {
      setMessage(strings.network);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{strings.codeSent}</p>
      <Field id="code" label={strings.emailCode} value={code} onChange={setCode} numeric />
      <Message text={message} />
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className={cn(buttonVariants(), "h-10")}
      >
        {strings.verify}
      </button>
      <button
        type="button"
        onClick={sendNew}
        disabled={resend.secondsLeft > 0}
        className={cn(buttonVariants({ variant: "outline" }), "h-10")}
      >
        {resend.secondsLeft > 0 ? strings.resendIn(resend.secondsLeft) : strings.resend}
      </button>
    </form>
  );
}

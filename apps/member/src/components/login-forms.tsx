import {
  codeMessage,
  loginMessage,
  minutesAndSeconds,
  passwordProblem,
  type LoginClient,
  type Session,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button, Field, Message } from "./form";
import { LinkButton } from "./link-button";

function useCountdown(initialSeconds: number) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + initialSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const restart = (seconds: number) => {
    const t = Date.now();
    setNow(t);
    setEndsAt(t + seconds * 1000);
  };
  return { secondsLeft, restart };
}

const CODE_LENGTH = 6;

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <View className="relative">
      <View testID="code-boxes" className="flex-row gap-1.5">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <View
            key={i}
            className={`min-h-[48px] flex-1 items-center justify-center rounded-[9px] border ${focused && i === active ? "border-blue" : "border-field"}`}
          >
            <Text className="font-figtree-extrabold text-xl text-ink">{value[i] ?? ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        aria-label={t.emailCode}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        caretHidden
        className="absolute inset-0 opacity-0"
      />
    </View>
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown(0);

  const submit = async () => {
    if (!username.trim() || !password) return setMessage(t.needLogin);
    setBusy(true);
    const result = await client.logIn({ username, password });
    setBusy(false);
    if (result.kind === "code_sent") return onCodeSent(result.session, result.resendAfterSeconds);
    if (result.kind === "locked") return lock.restart(result.retryAfterSeconds);
    setMessage(loginMessage(result, t));
  };

  const locked = lock.secondsLeft > 0;
  return (
    <View className="gap-3">
      <Field label={t.loginName} value={username} onChange={setUsername} />
      <Field label={t.password} value={password} onChange={setPassword} secure />
      {locked ? (
        <Message tone="info" text={t.locked(minutesAndSeconds(lock.secondsLeft))} />
      ) : (
        <Message text={message} />
      )}
      <Button label={t.logIn} onPress={submit} disabled={busy || locked} />
    </View>
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

  const submit = async () => {
    if (code.length !== 6) return setMessage(t.needCode);
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
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{t.codeSent}</Text>
      <CodeBoxes value={code} onChange={setCode} />
      <Message text={message} />
      <Button label={t.verify} onPress={submit} disabled={busy} />
      <Button
        secondary
        label={resend.secondsLeft > 0 ? t.resendIn(resend.secondsLeft) : t.resend}
        onPress={sendNew}
        disabled={resend.secondsLeft > 0}
      />
      <LinkButton href="/recover" label={t.cantGetCode} className="items-center py-2">
        <Text className="font-figtree-semibold text-sm text-blue">{t.cantGetCode}</Text>
      </LinkButton>
    </View>
  );
}

type ResetStep = "username" | "code" | "password" | "saved";

/**
 * S04a (REG-6): username, then the email code, then the new password typed twice.
 * S47: a signed-in member passes `knownUsername`, so the first step only asks to send the code.
 * The email code is still required before the password changes.
 */
export function ForgotPasswordForm({
  client,
  onLogIn,
  knownUsername,
}: {
  client: LoginClient;
  onLogIn: () => void;
  knownUsername?: string;
}) {
  const { t } = useLanguage();
  const [step, setStep] = useState<ResetStep>("username");
  const [username, setUsername] = useState("");
  const [resetId, setResetId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown(0);

  const sendCode = async () => {
    const name = (knownUsername ?? username).trim();
    if (!name) return setMessage(t.needUsername);
    setBusy(true);
    const result = await client.startPasswordReset(name);
    setBusy(false);
    if (result.kind === "network") return setMessage(t.network);
    setResetId(result.resetId);
    resend.restart(result.resendAfterSeconds);
    setCode("");
    setMessage(null);
    setStep("code");
  };

  const checkCode = async () => {
    if (code.length !== 6) return setMessage(t.needCode);
    setBusy(true);
    const result = await client.checkResetCode(resetId, code);
    setBusy(false);
    if (result.kind === "verified") {
      setMessage(null);
      return setStep("password");
    }
    setMessage(codeMessage(result, t));
  };

  const save = async () => {
    if (!password || !repeat) return setMessage(t.needNewPassword);
    if (passwordProblem(password)) return setMessage(t.problemPassword);
    if (password !== repeat) return setMessage(t.passwordsDiffer);
    setBusy(true);
    const result = await client.saveNewPassword(resetId, code, password);
    setBusy(false);
    if (result.kind === "verified") return setStep("saved");
    if (result.kind === "weak_password") return setMessage(t.problemPassword);
    setMessage(codeMessage(result, t));
    if (result.kind !== "network") {
      setCode("");
      setStep("code");
    }
  };

  if (step === "saved")
    return (
      <View className="gap-3">
        <Message tone="info" text={t.passwordChanged} />
        <Button label={t.logIn} onPress={onLogIn} />
      </View>
    );

  if (step === "password")
    return (
      <View className="gap-3">
        <Field
          label={t.newPassword}
          value={password}
          onChange={setPassword}
          secure
          hint={t.passwordHint}
        />
        <Field label={t.repeatPassword} value={repeat} onChange={setRepeat} secure />
        <Message text={message} />
        <Button label={t.savePassword} onPress={save} disabled={busy} />
      </View>
    );

  if (step === "code")
    return (
      <View className="gap-3">
        <Text className="font-figtree text-sm leading-5 text-ink-2">
          {knownUsername ? t.changeCodeSent : t.resetCodeSent}
        </Text>
        <CodeBoxes value={code} onChange={setCode} />
        <Message text={message} />
        <Button label={t.verify} onPress={checkCode} disabled={busy} />
        <Button
          secondary
          label={resend.secondsLeft > 0 ? t.resendIn(resend.secondsLeft) : t.resend}
          onPress={sendCode}
          disabled={busy || resend.secondsLeft > 0}
        />
        <LinkButton href="/recover" label={t.noEmailAccess} className="items-center py-2">
          <Text className="font-figtree-semibold text-sm text-blue">{t.noEmailAccess}</Text>
        </LinkButton>
      </View>
    );

  if (knownUsername)
    return (
      <View className="gap-3">
        <Text className="font-figtree text-sm leading-5 text-ink-2">{t.changePasswordIntro}</Text>
        <Message text={message} />
        <Button label={t.sendCode} onPress={sendCode} disabled={busy} />
      </View>
    );

  return (
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{t.forgotIntro}</Text>
      <Field label={t.username} value={username} onChange={setUsername} />
      <Message text={message} />
      <Button label={t.sendCode} onPress={sendCode} disabled={busy} />
    </View>
  );
}

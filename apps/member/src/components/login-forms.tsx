import {
  codeMessage,
  loginMessage,
  minutesAndSeconds,
  type LoginClient,
  type Session,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button, Field, Message } from "./form";

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
      <Field label={t.username} value={username} onChange={setUsername} />
      <Field label={t.password} value={password} onChange={setPassword} secure />
      {locked ? (
        <Message tone="info" text={t.locked(minutesAndSeconds(lock.secondsLeft))} />
      ) : (
        <Message text={message} />
      )}
      <Button
        label={t.logIn}
        onPress={submit}
        disabled={busy || locked || !username || !password}
      />
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
      <Button label={t.verify} onPress={submit} disabled={busy || code.length !== 6} />
      <Button
        secondary
        label={resend.secondsLeft > 0 ? t.resendIn(resend.secondsLeft) : t.resend}
        onPress={sendNew}
        disabled={resend.secondsLeft > 0}
      />
    </View>
  );
}

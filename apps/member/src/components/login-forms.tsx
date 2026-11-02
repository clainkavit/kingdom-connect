import {
  codeMessage,
  loginMessage,
  minutesAndSeconds,
  type LoginClient,
  type Session,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { strings } from "../strings";

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

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-figtree-semibold text-sm text-ink">{props.label}</Text>
      <TextInput
        aria-label={props.label}
        value={props.value}
        onChangeText={props.onChange}
        secureTextEntry={props.secure}
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-[44px] rounded-[9px] border border-field bg-surface px-3 font-figtree text-[15px] text-ink"
      />
    </View>
  );
}

const CODE_LENGTH = 6;

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        aria-label={strings.emailCode}
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

function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      role="button"
      aria-label={props.label}
      aria-disabled={props.disabled}
      disabled={props.disabled}
      onPress={props.onPress}
      className={`items-center justify-center px-4 ${props.secondary ? "min-h-[44px] rounded-[9px] border border-line bg-surface" : "min-h-[48px] rounded-[10px] bg-blue"} ${props.disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={
          props.secondary
            ? "font-figtree-semibold text-sm text-ink-2"
            : "font-figtree-bold text-[15px] text-blue-ink"
        }
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function Message({ text, tone = "bad" }: { text: string | null; tone?: "bad" | "info" }) {
  if (!text) return null;
  return (
    <View
      role="alert"
      className={`rounded-[10px] px-3 py-2.5 ${tone === "info" ? "bg-blue-soft" : "bg-bad-soft"}`}
    >
      <Text
        className={`font-figtree text-[13px] leading-[19px] ${tone === "info" ? "text-info-text" : "text-bad-text"}`}
      >
        {text}
      </Text>
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
    setMessage(loginMessage(result, strings));
  };

  const locked = lock.secondsLeft > 0;
  return (
    <View className="gap-3">
      <Field label={strings.username} value={username} onChange={setUsername} />
      <Field label={strings.password} value={password} onChange={setPassword} secure />
      {locked ? (
        <Message tone="info" text={strings.locked(minutesAndSeconds(lock.secondsLeft))} />
      ) : (
        <Message text={message} />
      )}
      <Button
        label={strings.logIn}
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
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown(resendAfterSeconds);

  const submit = async () => {
    setBusy(true);
    const result = await client.verifyCode(accessToken, code);
    setBusy(false);
    if (result.kind === "verified") return onVerified();
    setMessage(codeMessage(result, strings));
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
      setMessage(strings.tooManyCodes);
    } else {
      setMessage(strings.network);
    }
  };

  return (
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{strings.codeSent}</Text>
      <CodeBoxes value={code} onChange={setCode} />
      <Message text={message} />
      <Button label={strings.verify} onPress={submit} disabled={busy || code.length !== 6} />
      <Button
        secondary
        label={resend.secondsLeft > 0 ? strings.resendIn(resend.secondsLeft) : strings.resend}
        onPress={sendNew}
        disabled={resend.secondsLeft > 0}
      />
    </View>
  );
}

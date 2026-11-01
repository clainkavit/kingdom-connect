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
  numeric?: boolean;
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
        keyboardType={props.numeric ? "number-pad" : "default"}
        maxLength={props.numeric ? 6 : undefined}
        className="rounded-lg border border-line bg-surface px-3 py-2.5 font-figtree text-base text-ink"
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
      className={`items-center rounded-lg px-4 py-3 ${props.secondary ? "border border-line bg-surface" : "bg-blue"} ${props.disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`font-figtree-semibold text-sm ${props.secondary ? "text-ink" : "text-blue-ink"}`}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View role="alert" className="rounded-md bg-bad-soft px-3 py-2">
      <Text className="font-figtree-medium text-sm text-ink">{text}</Text>
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
    <View className="gap-4">
      <Field label={strings.username} value={username} onChange={setUsername} />
      <Field label={strings.password} value={password} onChange={setPassword} secure />
      <Message text={locked ? strings.locked(minutesAndSeconds(lock.secondsLeft)) : message} />
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
    <View className="gap-4">
      <Text className="font-figtree text-sm text-ink-2">{strings.codeSent}</Text>
      <Field label={strings.emailCode} value={code} onChange={setCode} numeric />
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

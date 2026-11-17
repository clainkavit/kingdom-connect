import {
  codeMessage,
  normalizePhone,
  type LoginClient,
  type Session,
} from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { AuthCard, TextButton } from "./auth-card";
import { Button, Field, Message } from "./form";
import { CodeBoxes, useCountdown } from "./login-forms";

/** +255 7•• ••• 412: enough for the person to recognise their number on screen. */
export const maskPhone = (phone: string) =>
  `${phone.slice(0, 4)} ${phone[4]}•• ••• ${phone.slice(-3)}`;

/**
 * S04b (R29, Web-PhoneSignin, Web-SmsCode): a +255 number, then the 6-digit SMS code. A right code hands
 * the session to `onSignedIn`; first-time numbers then reach S01a like the other sign-in routes.
 */
export function PhoneSignIn({
  client,
  onSignedIn,
  onAnotherWay,
}: {
  client: LoginClient;
  onSignedIn: (session: Session) => Promise<void>;
  onAnotherWay: () => void;
}) {
  const { t } = useLanguage();
  const [typed, setTyped] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown(0);

  const send = async (number: string) => {
    setBusy(true);
    const result = await client.startPhoneSignIn(number);
    setBusy(false);
    if (result.kind === "sent") {
      setPhone(number);
      setCode("");
      setMessage(null);
      resend.restart(60);
      return;
    }
    if (result.kind === "wait") {
      setPhone(number);
      resend.restart(60);
      return setMessage(t.phoneWait);
    }
    setMessage(
      result.kind === "not_tanzanian"
        ? t.phoneNotTanzanian
        : result.kind === "too_many_codes"
          ? t.tooManyCodes
          : t.network,
    );
  };

  if (!phone)
    return (
      <AuthCard
        title={t.phoneTitle}
        subtitle={t.phoneIntro}
        back={{ label: t.back, onPress: onAnotherWay }}
      >
        <View className="gap-3">
          <Field
            label={t.phoneNumberLabel}
            value={typed}
            keyboardType="phone-pad"
            placeholder="+255 7XX XXX XXX"
            onChange={setTyped}
          />
          <Message text={message} />
          <Button
            label={t.phoneSend}
            disabled={busy}
            onPress={() => {
              const number = normalizePhone(typed);
              if (!number) return setMessage(t.phoneNotTanzanian);
              void send(number);
            }}
          />
          <View className="items-center">
            <TextButton label={t.phoneAnotherWay} onPress={onAnotherWay} />
          </View>
          <Text className="text-center font-figtree text-[13px] leading-5 text-ink-2">
            {t.phoneRates}
          </Text>
        </View>
      </AuthCard>
    );

  const verify = async () => {
    if (code.length !== 6) return setMessage(t.needSmsCode);
    setBusy(true);
    const result = await client.verifyPhoneCode(phone, code);
    if (result.kind === "verified") return onSignedIn(result.session);
    setBusy(false);
    setMessage(codeMessage(result, t));
  };

  return (
    <AuthCard
      title={t.phoneCodeTitle}
      subtitle={t.phoneCodeSent(maskPhone(phone))}
      back={{ label: t.back, onPress: () => setPhone(null) }}
    >
      <View className="gap-3">
        <CodeBoxes value={code} onChange={setCode} label={t.smsCodeLabel} />
        <Message text={message} />
        <Button label={t.phoneContinue} onPress={verify} disabled={busy} />
        <Button
          secondary
          label={resend.secondsLeft > 0 ? t.resendIn(resend.secondsLeft) : t.resend}
          onPress={() => void send(phone)}
          disabled={resend.secondsLeft > 0 || busy}
        />
        <View className="items-center">
          <TextButton label={t.phoneChange} onPress={() => setPhone(null)} />
        </View>
      </View>
    </AuthCard>
  );
}

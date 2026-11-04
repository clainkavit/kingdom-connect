import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ContactApi, ContactResult } from "../lib/contact";
import { useLanguage } from "../lib/language";
import { Button, Field, Message } from "./form";

type Editing = "phone" | "address" | "email" | null;

function ValueRow({
  label,
  value,
  action,
  onPress,
}: {
  label: string;
  value: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-line py-3">
      <View className="gap-0.5">
        <Text className="font-figtree-semibold text-sm text-ink">{label}</Text>
        <Text className="font-figtree text-sm text-ink-2">{value}</Text>
      </View>
      <Button secondary label={action} onPress={onPress} />
    </View>
  );
}

/** S45 contact values: phone, address and email, each changed by the member (R08b). */
export function ContactDetails({
  api,
  phone,
  email,
  address,
  onChanged,
}: {
  api: ContactApi;
  phone: string;
  email: string;
  address: string;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<Editing>(null);
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);

  useEffect(() => {
    api.pendingRecovery().then(setRecovery, () => undefined);
  }, [api]);

  const cancelRecovery = async () => {
    if (await api.cancelRecovery().catch(() => false)) {
      setRecovery(null);
      setDone(t.recoveryCancelled);
    } else setProblem(t.saveFailed);
  };

  const problems: Record<Exclude<ContactResult, "ok">, string> = {
    invalid_phone: t.contactPhoneInvalid,
    too_long: t.tooLongField(300),
    wrong_password: t.contactWrongPassword,
    locked: t.contactPasswordLocked,
    invalid_email: t.contactEmailInvalid,
    same_email: t.contactEmailSame,
    email_taken: t.contactEmailTaken,
    too_many_codes: t.tooManyCodes,
    wrong_code: t.emailCodeWrong,
    expired: t.codeExpired,
    too_many_attempts: t.emailCodeWrong,
    no_code: t.codeExpired,
    failed: t.saveFailed,
  };

  const open = (which: Editing, start: string) => {
    setEditing(which);
    setValue(start);
    setPassword("");
    setCode("");
    setCodeSentTo(null);
    setProblem(null);
    setDone(null);
  };

  const run = async (action: () => Promise<ContactResult>, onOk: () => void) => {
    setBusy(true);
    setProblem(null);
    const result = await action().catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") return onOk();
    setProblem(problems[result]);
  };

  const finish = (message: string) => {
    setEditing(null);
    setDone(message);
    onChanged();
  };

  return (
    <View className="gap-2">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-base text-ink">
        {t.myContactTitle}
      </Text>
      {recovery ? (
        <View className="gap-2 rounded-lg bg-warn-soft p-3">
          <Text className="font-figtree text-sm text-warn-text">{t.recoveryPending(recovery)}</Text>
          <Button secondary label={t.recoveryCancel} onPress={cancelRecovery} />
        </View>
      ) : null}
      <ValueRow
        label={t.contactPhone}
        value={phone || t.notGiven}
        action={t.changePhone}
        onPress={() => open("phone", phone)}
      />
      {editing === "phone" ? (
        <View className="gap-2">
          <Field
            label={t.contactPhone}
            value={value}
            onChange={setValue}
            hint={t.contactPhoneHint}
          />
          <Button
            label={t.save}
            disabled={busy}
            onPress={() =>
              run(
                () => api.setPhone(value),
                () => finish(t.saved),
              )
            }
          />
        </View>
      ) : null}
      <ValueRow
        label={t.address}
        value={address || t.notGiven}
        action={t.changeAddress}
        onPress={() => open("address", address)}
      />
      {editing === "address" ? (
        <View className="gap-2">
          <Field label={t.address} value={value} onChange={setValue} multiline />
          <Button
            label={t.save}
            disabled={busy}
            onPress={() =>
              run(
                () => api.setAddress(value),
                () => finish(t.saved),
              )
            }
          />
        </View>
      ) : null}
      <ValueRow
        label={t.email}
        value={email || t.notGiven}
        action={t.changeEmail}
        onPress={() => open("email", "")}
      />
      {editing === "email" && !codeSentTo ? (
        <View className="gap-2">
          <Field label={t.password} value={password} onChange={setPassword} secure />
          <Field label={t.newEmailLabel} value={value} onChange={setValue} />
          <Button
            label={t.sendEmailCode}
            disabled={busy}
            onPress={() =>
              run(
                () => api.startEmailChange(password, value),
                () => setCodeSentTo(value.trim()),
              )
            }
          />
        </View>
      ) : null}
      {editing === "email" && codeSentTo ? (
        <View className="gap-2">
          <Text className="font-figtree text-sm text-ink">{t.emailCodeSent(codeSentTo)}</Text>
          <Field label={t.codeLabel} value={code} onChange={setCode} />
          <Button
            label={t.confirmNewEmail}
            disabled={busy}
            onPress={() =>
              run(
                () => api.confirmEmailChange(code),
                () => finish(t.emailChanged),
              )
            }
          />
        </View>
      ) : null}
      <Message text={problem} />
      <Message tone="info" text={done} />
    </View>
  );
}

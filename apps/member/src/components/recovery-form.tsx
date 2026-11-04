import type { EmailRecoveryRequest, EmailRecoveryResult } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button, Field, Message } from "./form";

export type PickedPhoto = { base64: string; mime: string; size: number };

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** S04 "Can't get the code?": ask to move the account to a new email (R08c, #146). */
export function RecoveryForm({
  send,
  pickPhoto,
}: {
  send: (request: EmailRecoveryRequest) => Promise<EmailRecoveryResult>;
  pickPhoto: () => Promise<PickedPhoto | null>;
}) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [digits, setDigits] = useState("");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const picked = await pickPhoto().catch(() => null);
    if (!picked) return;
    if (picked.size > MAX_PHOTO_BYTES) return setProblem(t.recoveryPhotoTooLarge);
    setProblem(null);
    setPhoto(picked);
  };

  const submit = async () => {
    if (!username.trim() || !newEmail.trim() || !/^\d{4}$/.test(digits) || !photo)
      return setProblem(t.recoveryInvalid);
    setBusy(true);
    const result = await send({
      username: username.trim(),
      newEmail: newEmail.trim(),
      lastDigits: digits,
      photo: photo.base64,
      mime: photo.mime,
    }).catch(() => "failed" as const);
    setBusy(false);
    if (result === "sent") return setSent(true);
    setProblem(
      result === "invalid"
        ? t.recoveryInvalid
        : result === "photo_too_large"
          ? t.recoveryPhotoTooLarge
          : t.recoveryFailed,
    );
  };

  if (sent) return <Message tone="info" text={t.recoverySent} />;

  return (
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{t.recoveryIntro}</Text>
      <Field label={t.recoveryUsername} value={username} onChange={setUsername} />
      <Field
        label={t.recoveryNewEmail}
        value={newEmail}
        onChange={setNewEmail}
        keyboardType="email-address"
      />
      <Field
        label={t.recoveryDigits}
        value={digits}
        onChange={(v) => setDigits(v.replace(/\D/g, "").slice(0, 4))}
        keyboardType="number-pad"
      />
      <Button secondary label={t.recoveryPhoto} onPress={choose} />
      {photo ? <Text className="font-figtree text-sm text-ink">{t.recoveryPhotoAdded}</Text> : null}
      <Message text={problem} />
      <Button label={t.recoverySend} onPress={submit} disabled={busy} />
    </View>
  );
}

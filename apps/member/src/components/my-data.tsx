import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { MyDataApi } from "../lib/my-data";
import { Button, Checkbox, Message } from "./form";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";

function Bullets({ items }: { items: string[] }) {
  return (
    <View className="gap-1.5">
      {items.map((item) => (
        <Text key={item} className="font-figtree text-[15px] leading-[22px] text-ink">
          {`• ${item}`}
        </Text>
      ))}
    </View>
  );
}

/** S49: download my data, or delete it after a full-screen confirmation (schema section 14). */
export function MyDataScreen({ api, onDeleted }: { api: MyDataApi; onDeleted: () => void }) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "bad" | "info" } | null>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    const ok = await api.download().catch(() => false);
    setBusy(false);
    setMessage(
      ok ? { text: t.dataDownloaded, tone: "info" } : { text: t.dataDownloadFailed, tone: "bad" },
    );
  };

  const deleteAll = async () => {
    if (!understood) return setMessage({ text: t.dataConfirmTick, tone: "bad" });
    setBusy(true);
    const ok = await api.deleteAll().catch(() => false);
    setBusy(false);
    if (ok) return onDeleted();
    setMessage({ text: t.dataDeleteFailed, tone: "bad" });
  };

  if (confirming)
    return (
      <View className="gap-4">
        <ScreenTitle>{t.dataDeleteTitle}</ScreenTitle>
        <Section title={t.dataRemovedTitle}>
          <Bullets items={[t.dataRemoved1, t.dataRemoved2, t.dataRemoved3]} />
        </Section>
        <Section title={t.dataKeptTitle}>
          <Bullets items={[t.dataKept1, t.dataKept2, t.dataKept3]} />
        </Section>
        <Checkbox label={t.dataUnderstand} checked={understood} onChange={setUnderstood} />
        <Message text={message?.text ?? null} tone={message?.tone} />
        <View className="flex-row flex-wrap gap-2">
          <Button label={t.dataDeleteForGood} onPress={deleteAll} disabled={busy} />
          <Button
            secondary
            label={t.dataKeepAccount}
            onPress={() => {
              setConfirming(false);
              setUnderstood(false);
              setMessage(null);
            }}
          />
        </View>
      </View>
    );

  return (
    <View className="gap-4">
      <ScreenTitle>{t.dataTitle}</ScreenTitle>
      <Section title={t.dataDownloadTitle}>
        <Text className="font-figtree text-sm text-ink-2">{t.dataDownloadHint}</Text>
        <Button secondary label={t.dataDownload} onPress={download} disabled={busy} />
      </Section>
      <Section title={t.dataDeleteTitle}>
        <Text className="font-figtree text-sm text-ink-2">{t.dataDeleteHint}</Text>
        <Button
          secondary
          label={t.dataDelete}
          onPress={() => {
            setMessage(null);
            setConfirming(true);
          }}
        />
      </Section>
      <Message text={message?.text ?? null} tone={message?.tone} />
    </View>
  );
}

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { ConnectionsApi } from "../lib/connections";
import type { PrivacyApi, PrivacySettings, PrivacySwitch } from "../lib/privacy";
import { BlockedList } from "./connections";
import { Message, Switch } from "./form";
import { LinkButton } from "./link-button";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="gap-1 rounded-card border border-line bg-surface px-4 py-2">
      {title ? (
        <Text role="heading" aria-level={2} className="pt-2 font-figtree-bold text-base text-ink">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** S44: the settings built so far. */
export function SettingsMenu() {
  const { t } = useLanguage();
  return (
    <View className="gap-4">
      <ScreenTitle>{t.navSettings}</ScreenTitle>
      <View className="rounded-card border border-line bg-surface">
        <LinkButton
          href="/settings/privacy"
          label={t.privacyTitle}
          className="min-h-[52px] flex-row items-center justify-between px-4"
        >
          <Text className="font-figtree text-[15px] text-ink">{t.privacyTitle}</Text>
          <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
            ›
          </Text>
        </LinkButton>
        <LinkButton
          href="/settings/data"
          label={t.dataTitle}
          className="min-h-[52px] flex-row items-center justify-between border-t border-line px-4"
        >
          <Text className="font-figtree text-[15px] text-ink">{t.dataTitle}</Text>
          <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
            ›
          </Text>
        </LinkButton>
      </View>
    </View>
  );
}

/** S45: hide from the directory, and choose what connections may see. Each switch saves at once. */
export function PrivacyScreen({
  api,
  connections,
}: {
  api: PrivacyApi;
  connections: ConnectionsApi;
}) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState<PrivacySwitch | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.load().then(
      (loaded) => live && setSettings(loaded),
      () => live && setLoadFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  if (loadFailed)
    return (
      <ErrorState
        message={t.privacyLoadFailed}
        onRetry={() => {
          setLoadFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (!settings) return <LoadingRows />;

  const saveSwitch = async (key: PrivacySwitch, on: boolean) => {
    setSaveFailed(false);
    setSaving(key);
    setSettings((s) => s && { ...s, [key]: on });
    const saved = await api.set(key, on).catch(() => false);
    setSaving(null);
    if (!saved) {
      setSettings((s) => s && { ...s, [key]: !on });
      setSaveFailed(true);
    }
  };

  const switchFor = (key: PrivacySwitch, label: string, hint: string) => (
    <Switch
      label={label}
      hint={hint}
      checked={settings[key]}
      onChange={(on) => saveSwitch(key, on)}
      disabled={saving === key}
    />
  );

  return (
    <View className="gap-4">
      <ScreenTitle>{t.privacyTitle}</ScreenTitle>
      <Text className="font-figtree text-[15px] leading-[22px] text-ink">{t.privacyIntro}</Text>
      <Message text={saveFailed ? t.privacySaveFailed : null} />
      <Card>{switchFor("hidden", t.hideFromDirectory, t.hideFromDirectoryHint)}</Card>
      <Card title={t.sharingTitle}>
        {switchFor("sharePhone", t.sharePhone, settings.phone || t.notGiven)}
        {switchFor("shareEmail", t.shareEmail, settings.email || t.notGiven)}
        {switchFor("shareAddress", t.shareAddress, settings.address || t.notGiven)}
        <Text className="pb-2 font-figtree text-[13px] text-ink-2">{t.contactLocked}</Text>
      </Card>
      <BlockedList api={connections} />
    </View>
  );
}

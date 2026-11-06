import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { AuthCard } from "../src/components/auth-card";
import { Button, Message } from "../src/components/form";
import { useLanguage } from "../src/lib/language";
import { demoLinks, supabase } from "../src/lib/supabase";

const tokenInAddress = () =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "");

/** One-time demo sign-in that waits for a tap, so a link preview cannot use the link up. */
export default function DemoScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!demoLinks) return <Redirect href="/login" />;

  const open = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenInAddress(),
      type: "magiclink",
    });
    setBusy(false);
    if (error) return setFailed(true);
    router.replace("/");
  };

  return (
    <AuthCard title={t.demoTitle}>
      <Text className="font-figtree text-sm text-ink-2">{t.demoIntro}</Text>
      <Message text={failed ? t.demoFailed : null} />
      <Button label={t.demoOpen} onPress={open} disabled={busy} />
    </AuthCard>
  );
}

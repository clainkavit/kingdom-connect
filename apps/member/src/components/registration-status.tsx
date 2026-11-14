import type { ApplicationStatus } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button, Message } from "./form";
import { LinkButton } from "./link-button";

type Shown = Extract<ApplicationStatus, { kind: "under_review" } | { kind: "rejected" }>;

function Line({ text, tone }: { text: string; tone: "warn" | "bad" }) {
  return (
    <Text
      className={`font-figtree text-sm leading-5 ${tone === "bad" ? "text-bad-text" : "text-warn-text"}`}
    >
      {text}
    </Text>
  );
}

/** S06: where a submitted application stands. */
export function RegistrationStatus({
  status,
  onResubmit,
}: {
  status: Shown;
  onResubmit: () => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rejected = status.kind === "rejected";
  const tone = rejected ? "bad" : "warn";

  const resubmit = async () => {
    setBusy(true);
    const ok = await onResubmit();
    setBusy(false);
    setFailed(!ok);
  };

  return (
    <View className="gap-4">
      <View className={`gap-1.5 rounded-card p-4 ${rejected ? "bg-bad-soft" : "bg-warn-soft"}`}>
        <Text
          className={`font-figtree-extrabold text-base ${rejected ? "text-bad-text" : "text-warn-text"}`}
        >
          {rejected ? t.rejectedStatusTitle : t.pendingStatusTitle}
        </Text>
        {status.kind === "under_review" ? (
          <Line tone={tone} text={t.pendingStatus} />
        ) : (
          <>
            <Line tone={tone} text={t.rejectedStatus} />
            {status.reason ? <Line tone={tone} text={t.statusReason(status.reason)} /> : null}
            <Line tone={tone} text={status.final ? t.rejectedFinal : t.resubmitOnce} />
          </>
        )}
      </View>
      {rejected && !status.final ? (
        <>
          <Message text={failed ? t.resubmitFailed : null} />
          <Button label={t.fixAndResubmit} onPress={resubmit} disabled={busy} />
        </>
      ) : null}
      <LinkButton
        href="/"
        label={t.lookAround}
        className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
      >
        <Text className="font-figtree-semibold text-sm text-ink-2">{t.lookAround}</Text>
      </LinkButton>
    </View>
  );
}

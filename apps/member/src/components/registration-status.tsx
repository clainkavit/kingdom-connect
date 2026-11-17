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

  if (status.kind === "under_review")
    return (
      <View className="gap-4">
        <View className="flex-row flex-wrap items-center gap-3">
          <Text
            role="heading"
            aria-level={1}
            className="font-figtree-extrabold text-[30px] leading-[36px] text-navy"
          >
            {t.lookCheckingTitle}
          </Text>
          <Text className="rounded-full bg-warn-soft px-2.5 py-1 font-figtree-bold text-[12px] text-warn-text">
            {t.pendingStatusTitle}
          </Text>
        </View>
        <View className="gap-4 rounded-card border border-line bg-surface px-6 py-5">
          {(
            [
              ["bg-good", t.statusSentToStaff, null],
              ["bg-gold-deep", t.statusStaffCheck, t.pendingStatus],
              ["bg-line-2", t.statusYouCanAct, t.statusWeEmail],
            ] as const
          ).map(([dot, title, note]) => (
            <View key={title} className="flex-row gap-3">
              <View className={`mt-1.5 h-3 w-3 rounded-full ${dot}`} />
              <View className="flex-1 gap-0.5">
                <Text className="font-figtree-bold text-[15px] text-ink">{title}</Text>
                {note ? (
                  <Text className="font-figtree text-[13px] leading-5 text-ink-2">{note}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
        <Text className="font-figtree text-[14px] leading-[21px] text-ink-2">
          {t.statusUntilThen}
        </Text>
        <LinkButton
          href="/"
          label={t.lookAround}
          className="min-h-[44px] items-center justify-center self-start rounded-full border border-line-2 bg-surface px-5"
        >
          <Text className="font-figtree-semibold text-[15px] text-ink">{t.lookAround}</Text>
        </LinkButton>
      </View>
    );

  return (
    <View className="gap-4">
      <View className={`gap-1.5 rounded-card p-4 ${rejected ? "bg-bad-soft" : "bg-warn-soft"}`}>
        <Text
          className={`font-figtree-extrabold text-base ${rejected ? "text-bad-text" : "text-warn-text"}`}
        >
          {rejected ? t.rejectedStatusTitle : t.pendingStatusTitle}
        </Text>
        <Line tone={tone} text={t.rejectedStatus} />
        {status.reason ? <Line tone={tone} text={t.statusReason(status.reason)} /> : null}
        <Line tone={tone} text={status.final ? t.rejectedFinal : t.resubmitOnce} />
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
        className="min-h-[44px] items-center justify-center rounded-full border border-line-2 bg-surface px-4"
      >
        <Text className="font-figtree-semibold text-sm text-ink-2">{t.lookAround}</Text>
      </LinkButton>
    </View>
  );
}

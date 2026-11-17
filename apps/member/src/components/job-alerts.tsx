import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Language, Strings, TextKey } from "@kingdom-connect/shared";
import { sameFilters, type JobAlert, type JobAlertsApi } from "../lib/job-alerts";
import { useLanguage } from "../lib/language";
import type { OpportunityFilters } from "../lib/opportunity-browse";
import { useLoad } from "./events";
import { Message, Switch } from "./form";
import { useAct } from "./look";
import { typeLabel } from "./opportunity-form";
import { PageHeader } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const employmentKey: Record<NonNullable<JobAlert["employment"]>, TextKey> = {
  full_time: "empFullTime",
  part_time: "empPartTime",
  contract: "empContract",
  internship: "empInternship",
};

/** The filters an alert holds, in words. */
export function describeAlert(t: Strings, alert: JobAlert, language: Language): string {
  const parts = [
    alert.kind ? (t[typeLabel[alert.kind]] as string) : null,
    alert.regionName ? alert.regionName[language] : null,
    alert.sectorName ? alert.sectorName[language] : null,
    alert.employment ? (t[employmentKey[alert.employment]] as string) : null,
    alert.remoteOnly ? t.oppRemoteOnly : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t.alertsAny;
}

/** O13: on Opportunities, a switch that keeps the filters on screen as a daily alert. */
export function AlertSwitch({ api, filters }: { api: JobAlertsApi; filters: OpportunityFilters }) {
  const { t } = useLanguage();
  const act = useAct();
  const [attempt, setAttempt] = useState(0);
  const alerts = useLoad(() => api.list().catch(() => [] as JobAlert[]), attempt);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (alerts.state !== "ready") return null;
  const current = alerts.value.find((a) => sameFilters(a, filters));

  const toggle = async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    if (on) {
      const result = await api.add(filters).catch(() => "failed" as const);
      if (result === "limit") setProblem(t.alertsLimit);
      else if (result === "failed") setProblem(t.alertsFailed);
    } else if (current && !(await api.remove(current.id).catch(() => false))) {
      setProblem(t.alertsFailed);
    }
    setBusy(false);
    setAttempt((a) => a + 1);
  };

  return (
    <View className="gap-1">
      <Switch
        label={t.alertMe}
        hint={t.alertMeHint}
        checked={Boolean(current)}
        onChange={(on) => act("alert", () => toggle(on))}
        disabled={busy}
      />
      <Message text={problem} />
    </View>
  );
}

/** O13: Settings, Job alerts: the member's alerts in words, each with Remove. */
export function JobAlertsScreen({ api }: { api: JobAlertsApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const alerts = useLoad(() => api.list(), attempt);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (await api.remove(id).catch(() => false)) {
      setProblem(null);
      setAttempt((a) => a + 1);
    } else setProblem(t.alertsFailed);
  };

  return (
    <View className="w-full max-w-[1200px] gap-4 self-center">
      <View className="w-full max-w-[720px] gap-4">
        <PageHeader
          back={{ label: t.navOpportunities, href: "/opportunities" }}
          title={t.alertsTitle}
          subtitle={t.alertsIntro}
        />
        <Message text={problem} />
        {alerts.state === "failed" ? (
          <ErrorState message={t.alertsLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
        ) : alerts.state === "loading" ? (
          <LoadingRows />
        ) : alerts.value.length === 0 ? (
          <EmptyState
            title={t.alertsEmpty}
            message={t.alertsEmptyHint}
            action={{ label: t.navOpportunities, href: "/opportunities" }}
          />
        ) : (
          <View className="rounded-card border border-line bg-surface px-5 py-1">
            {alerts.value.map((alert, i) => {
              const words = describeAlert(t, alert, language);
              return (
                <View
                  key={alert.id}
                  className={`min-h-[68px] flex-row flex-wrap items-center justify-between gap-3 py-3 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <Text className="flex-1 font-figtree-bold text-[15px] text-ink">{words}</Text>
                  <Pressable
                    role="button"
                    aria-label={t.alertsRemoveThis(words)}
                    onPress={() => remove(alert.id)}
                    className="min-h-[44px] items-center justify-center rounded-full border border-line-2 bg-surface px-4"
                  >
                    <Text className="font-figtree-semibold text-sm text-ink">{t.savedRemove}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
        {alerts.state === "ready" && alerts.value.length > 0 ? (
          <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.alertsKeepNote}</Text>
        ) : null}
      </View>
    </View>
  );
}

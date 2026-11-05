import { formatDate, POSTER_LEVEL, type TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ConnectionsApi, ReceivedRequest, SentRequest } from "../lib/connections";
import type { DashboardApi, Welcome } from "../lib/dashboard";
import { useLanguage } from "../lib/language";
import { PersonRow, ReceivedRequestRow } from "./connections";
import { Message } from "./form";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

type QuickAction = { key: TextKey; href: string; minLevel: number; posts: boolean };

const quickActions: QuickAction[] = [
  { key: "actionShareIdea", href: "/ideas", minLevel: 1, posts: true },
  { key: "actionScan", href: "/opportunities", minLevel: 1, posts: false },
  { key: "actionPostTraining", href: "/training", minLevel: 1, posts: true },
  { key: "actionPostOpportunity", href: "/opportunities", minLevel: POSTER_LEVEL, posts: true },
];

type DashboardData = { welcome: Welcome; received: ReceivedRequest[]; sent: SentRequest[] };

function WelcomeCard({ welcome, today }: { welcome: Welcome; today: Date }) {
  const { t, language } = useLanguage();
  const place = [welcome.district, welcome.region]
    .filter((p) => p !== null)
    .map((p) => p[language])
    .join(", ");
  return (
    <View className="gap-1">
      <ScreenTitle>{t.navDashboard}</ScreenTitle>
      <Text role="heading" aria-level={2} className="font-figtree-bold text-lg text-ink">
        {t.dashboardHello(welcome.fullName)}
      </Text>
      <Text className="font-figtree text-sm text-ink-2">
        {[formatDate(today, language), place].filter(Boolean).join(" · ")}
      </Text>
    </View>
  );
}

function QuickActions({ welcome }: { welcome: Welcome }) {
  const { t } = useLanguage();
  const allowed = quickActions.filter(
    (a) => welcome.level >= a.minLevel && !(a.posts && welcome.postingPaused),
  );
  return (
    <Section title={t.quickActions}>
      <View className="flex-row flex-wrap gap-2">
        {allowed.map((a) => (
          <LinkButton
            key={a.key}
            href={a.href}
            label={t[a.key] as string}
            className="rounded-lg border border-line bg-surface px-4 py-2.5"
          >
            <Text className="font-figtree-semibold text-sm text-blue-ink">
              {t[a.key] as string}
            </Text>
          </LinkButton>
        ))}
      </View>
      {welcome.postingPaused ? (
        <Text className="font-figtree text-sm text-ink-2">{t.postingPausedNote}</Text>
      ) : welcome.level < POSTER_LEVEL ? (
        <LinkButton href="/business" label={t.verifyBusinessLink} className="py-1">
          <Text className="font-figtree text-sm text-blue-ink">{t.upgradeToPost}</Text>
        </LinkButton>
      ) : null}
    </Section>
  );
}

/** S08: the Release 1 widgets. No platform-wide figure is ever loaded (PRD section 7, criterion 1). */
export function DashboardScreen({
  api,
  connections,
  today = new Date(),
}: {
  api: DashboardApi;
  connections: ConnectionsApi;
  today?: Date;
}) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([api.welcome(), connections.received(), connections.sent()]).then(
      ([welcome, received, sent]) => {
        if (!live) return;
        if (welcome) setLoaded({ welcome, received, sent });
        else setFailed(true);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, connections, attempt]);

  const answer = async (requestId: string, accept: boolean) => {
    setActionFailed(false);
    if (await connections.answer(requestId, accept).catch(() => false)) setAttempt((a) => a + 1);
    else setActionFailed(true);
  };

  if (failed)
    return (
      <ErrorState
        message={t.dashboardLoadFailed}
        onRetry={() => {
          setFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (!loaded) return <LoadingRows />;

  return (
    <View className="gap-4">
      <WelcomeCard welcome={loaded.welcome} today={today} />
      <Message text={actionFailed ? t.actionFailed : null} />
      <Section title={t.dashboardRequests}>
        {loaded.received.length ? (
          loaded.received.map((r) => (
            <ReceivedRequestRow
              key={r.requestId}
              request={r}
              onAnswer={(accept) => answer(r.requestId, accept)}
            />
          ))
        ) : (
          <EmptyState
            title={t.noRequestsWaiting}
            message={t.noRequestsMessage}
            action={{ label: t.findPeople, href: "/people" }}
          />
        )}
      </Section>
      <Section title={t.myActivity}>
        {loaded.sent.length ? (
          loaded.sent.map((r) => (
            <PersonRow key={r.requestId} person={r}>
              <Text className="font-figtree text-sm text-ink-2">{t.requestSent}</Text>
            </PersonRow>
          ))
        ) : (
          <EmptyState title={t.activityEmptyTitle} message={t.activityEmptyMessage} />
        )}
      </Section>
      <QuickActions welcome={loaded.welcome} />
    </View>
  );
}

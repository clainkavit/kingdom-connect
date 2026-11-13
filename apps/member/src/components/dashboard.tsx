import { formatDate, formatDateTime, POSTER_LEVEL, type TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import type { Profile } from "../lib/profile";
import { Text, View } from "react-native";
import type { ConnectionsApi, ReceivedRequest, SentRequest } from "../lib/connections";
import type { DashboardApi, MyRegistration, Welcome } from "../lib/dashboard";
import { useLanguage } from "../lib/language";
import { PersonRow, ReceivedRequestRow } from "./connections";
import { Message } from "./form";
import { LinkButton } from "./link-button";
import { Avatar, NextSteps, Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import type { DashboardWidgetsApi } from "../lib/dashboard-widgets";
import type { MemberNewsApi } from "../lib/news";
import type { PeopleYouMayKnowApi } from "../lib/people-you-may-know";
import { FeaturedOpportunities, LatestItems, NewsPreview } from "./dashboard-widgets";
import { PeopleYouMayKnow } from "./people-you-may-know";
import { usePhone } from "./sheet";

type QuickAction = { key: TextKey; href: string; minLevel: number; posts: boolean };

const quickActions: QuickAction[] = [
  { key: "actionShareIdea", href: "/ideas/new", minLevel: 1, posts: true },
  { key: "actionScan", href: "/opportunities/scan", minLevel: 1, posts: false },
  { key: "actionPostTraining", href: "/training", minLevel: 1, posts: true },
  { key: "actionPostOpportunity", href: "/opportunities/new", minLevel: POSTER_LEVEL, posts: true },
];

type DashboardData = {
  welcome: Welcome;
  received: ReceivedRequest[];
  sent: SentRequest[];
  registrations: MyRegistration[];
};

function RegistrationRow({ item }: { item: MyRegistration }) {
  const { t, language } = useLanguage();
  const href = item.kind === "training" ? `/training/${item.id}` : `/events/${item.id}`;
  const when = item.startsAt
    ? formatDateTime(new Date(item.startsAt), language)
    : t.trainingSelfPaced;
  const state =
    item.status === "waitlisted" && item.waitlistPosition
      ? t.eventsWaitlisted(item.waitlistPosition)
      : item.kind === "training"
        ? t.trainingRegistered
        : t.eventsRegistered;
  return (
    <LinkButton
      href={href}
      label={item.title}
      className="min-h-[52px] gap-0.5 rounded-card border border-line bg-surface px-4 py-3"
    >
      <Text className="font-figtree-semibold text-[15px] text-ink">{item.title}</Text>
      <Text className="font-figtree text-[13px] text-ink-2">
        {item.kind === "training" ? t.myActivityTraining : t.myActivityEvent} · {when} · {state}
      </Text>
    </LinkButton>
  );
}

function WelcomeCard({ welcome, today }: { welcome: Welcome; today: Date }) {
  const { t, language } = useLanguage();
  const place = [welcome.district, welcome.region]
    .filter((p) => p !== null)
    .map((p) => p[language])
    .join(", ");
  return (
    <View className="gap-1">
      <ScreenTitle>{t.tabHome}</ScreenTitle>
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
            <Text className="font-figtree-semibold text-sm text-blue">{t[a.key] as string}</Text>
          </LinkButton>
        ))}
      </View>
      {welcome.postingPaused ? (
        <Text className="font-figtree text-sm text-ink-2">{t.postingPausedNote}</Text>
      ) : welcome.level < POSTER_LEVEL ? (
        <LinkButton href="/business" label={t.verifyBusinessLink} className="py-1">
          <Text className="font-figtree text-sm text-blue">{t.upgradeToPost}</Text>
        </LinkButton>
      ) : null}
    </Section>
  );
}

const shortcuts: { key: TextKey; href: string }[] = [
  { key: "myConnections", href: "/connections" },
  { key: "savedTitle", href: "/opportunities/saved" },
  { key: "respMineTitle", href: "/opportunities/responses" },
];

/** The member's own corner of Home: who they are, what to finish on their profile, and their shortcuts. */
function MemberColumn({ welcome, profile }: { welcome: Welcome; profile: Profile | null }) {
  const { t, language } = useLanguage();
  const place = [welcome.district, welcome.region]
    .filter((p) => p !== null)
    .map((p) => p[language])
    .join(", ");
  return (
    <View className="gap-4">
      <LinkButton
        href="/profile"
        label={t.myProfile}
        className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
      >
        <Avatar name={welcome.fullName} url={profile?.photoUrl ?? null} size={52} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-figtree-bold text-[16px] text-ink">{welcome.fullName}</Text>
          {place ? <Text className="font-figtree text-[13px] text-ink-2">{place}</Text> : null}
        </View>
      </LinkButton>
      {profile ? <NextSteps profile={profile} /> : null}
      <View className="rounded-card border border-line bg-surface">
        {shortcuts.map((item, i) => (
          <LinkButton
            key={item.href}
            href={item.href}
            label={t[item.key] as string}
            className={`min-h-[48px] flex-row items-center justify-between px-4 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <Text className="font-figtree-semibold text-[15px] text-ink">
              {t[item.key] as string}
            </Text>
            <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
              ›
            </Text>
          </LinkButton>
        ))}
      </View>
    </View>
  );
}

/** S08. No platform-wide figure is ever loaded (PRD section 7, criterion 1); the widgets show items, never counts. */
export function DashboardScreen({
  api,
  connections,
  widgets,
  news,
  people,
  profile,
  today = new Date(),
}: {
  api: DashboardApi;
  connections: ConnectionsApi;
  widgets?: DashboardWidgetsApi;
  news?: MemberNewsApi;
  people?: PeopleYouMayKnowApi;
  profile?: () => Promise<Profile | null>;
  today?: Date;
}) {
  const { t } = useLanguage();
  const phone = usePhone();
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    let live = true;
    profile?.().then(
      (p) => live && setMe(p),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [profile]);
  const [loaded, setLoaded] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.welcome(),
      connections.received(),
      connections.sent(),
      api.registrations(),
    ]).then(
      ([welcome, received, sent, registrations]) => {
        if (!live) return;
        if (welcome) setLoaded({ welcome, received, sent, registrations });
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

  const main = (
    <View className="gap-4">
      <WelcomeCard welcome={loaded.welcome} today={today} />
      {phone ? <MemberColumn welcome={loaded.welcome} profile={me} /> : null}
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
      {people ? <PeopleYouMayKnow api={people} /> : null}
      <Section title={t.myActivity}>
        {loaded.sent.length || loaded.registrations.length ? (
          <>
            {loaded.registrations.map((r) => (
              <RegistrationRow key={`${r.kind}-${r.id}`} item={r} />
            ))}
            {loaded.sent.map((r) => (
              <PersonRow key={r.requestId} person={r}>
                <Text className="font-figtree text-sm text-ink-2">{t.requestSent}</Text>
              </PersonRow>
            ))}
          </>
        ) : (
          <EmptyState title={t.activityEmptyTitle} message={t.activityEmptyMessage} />
        )}
      </Section>
      {widgets ? <FeaturedOpportunities api={widgets} /> : null}
      {widgets ? <LatestItems api={widgets} /> : null}
      <QuickActions welcome={loaded.welcome} />
      {news ? <NewsPreview api={news} /> : null}
    </View>
  );
  if (phone) return main;
  return (
    <View className="flex-row items-start gap-6">
      <View className="w-[300px]">
        <MemberColumn welcome={loaded.welcome} profile={me} />
      </View>
      <View className="min-w-0 flex-1">{main}</View>
    </View>
  );
}

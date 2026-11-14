import { formatDate, formatDateTime, POSTER_LEVEL, type TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import type { Profile } from "../lib/profile";
import { Text, View } from "react-native";
import type { ConnectionsApi, ReceivedRequest, SentRequest } from "../lib/connections";
import type { DashboardApi, MyRegistration, Welcome } from "../lib/dashboard";
import { useLanguage } from "../lib/language";
import type { ScanApi, ScanMatch } from "../lib/scan";
import { PersonRow, ReceivedRequestRow } from "./connections";
import { useLoad } from "./events";
import { Message } from "./form";
import { LinkButton } from "./link-button";
import { NextSteps, Section } from "./profile";
import { reasonText } from "./scan";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import type { DashboardWidgetsApi } from "../lib/dashboard-widgets";
import type { MemberNewsApi } from "../lib/news";
import type { PeopleYouMayKnowApi } from "../lib/people-you-may-know";
import { FeaturedList, LatestItems, NewsPreview } from "./dashboard-widgets";
import { closingDay } from "./opportunities";
import { typeLabel } from "./opportunity-form";
import { PeopleYouMayKnow } from "./people-you-may-know";
import { usePhone } from "./sheet";

type QuickAction = { key: TextKey; href: string; minLevel: number; posts: boolean };

const quickActions: QuickAction[] = [
  { key: "actionShareIdea", href: "/ideas/new", minLevel: 1, posts: true },
  { key: "actionScan", href: "/opportunities/scan", minLevel: 1, posts: false },
  { key: "actionPostTraining", href: "/training", minLevel: 1, posts: true },
  { key: "actionPostOpportunity", href: "/opportunities/new", minLevel: POSTER_LEVEL, posts: true },
];

const categoryLabel: Record<string, TextKey> = {
  professional: "categoryProfessional",
  businessperson: "categoryBusinessperson",
  other: "categoryOther",
};

type DashboardData = {
  welcome: Welcome;
  received: ReceivedRequest[];
  sent: SentRequest[];
  registrations: MyRegistration[];
};

function Chip({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "good" }) {
  return (
    <View className={`rounded-full px-3 py-1 ${tone === "good" ? "bg-good-soft" : "bg-blue-soft"}`}>
      <Text
        className={`font-figtree-bold text-xs ${tone === "good" ? "text-good-text" : "text-navy"}`}
      >
        {text}
      </Text>
    </View>
  );
}

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

/** The canvas welcome: date and place, the member's name, their badges and what they can do next. */
function WelcomeCard({ welcome, today }: { welcome: Welcome; today: Date }) {
  const { t, language } = useLanguage();
  const place = [welcome.district, welcome.region]
    .filter((p) => p !== null)
    .map((p) => p[language])
    .join(", ");
  const actions = quickActions.filter(
    (a) => welcome.level >= a.minLevel && !(a.posts && welcome.postingPaused),
  );
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-5">
      <ScreenTitle>{t.tabHome}</ScreenTitle>
      <Text className="font-figtree text-sm text-ink-2">
        {[formatDate(today, language), place].filter(Boolean).join(" · ")}
      </Text>
      <Text role="heading" aria-level={2} className="font-figtree-extrabold text-2xl text-navy">
        {t.dashboardHello(welcome.fullName)}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Chip tone="good" text={t.homeVerifiedMember} />
        {welcome.categories
          .filter((c) => categoryLabel[c])
          .map((c) => (
            <Chip key={c} text={t[categoryLabel[c]!] as string} />
          ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {actions.map((a) => (
          <LinkButton
            key={a.href}
            href={a.href}
            label={t[a.key] as string}
            className="min-h-[44px] justify-center rounded-full border border-line bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-sm text-navy">{t[a.key] as string}</Text>
          </LinkButton>
        ))}
        {!welcome.postingPaused && welcome.level < POSTER_LEVEL ? (
          <LinkButton
            href="/business"
            label={t.verifyBusinessLink}
            className="min-h-[44px] justify-center rounded-full bg-navy px-4"
          >
            <Text className="font-figtree-semibold text-sm text-navy-ink">{t.upgradeToPost}</Text>
          </LinkButton>
        ) : null}
      </View>
      {welcome.postingPaused ? (
        <Text className="font-figtree text-sm text-ink-2">{t.postingPausedNote}</Text>
      ) : null}
    </View>
  );
}

function LevelSteps({ level }: { level: number }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row flex-wrap gap-2">
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          className={`rounded-full px-3 py-1 ${n <= level ? "bg-navy" : "border border-line bg-surface"}`}
        >
          <Text
            className={`font-figtree-bold text-xs ${n <= level ? "text-navy-ink" : "text-ink-2"}`}
          >
            {t.myProfilesLevel(n)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** My profiles (canvas): one card per category the member ticked, each with what unlocks its badge. */
function MyProfiles({ welcome, profile }: { welcome: Welcome; profile: Profile | null }) {
  const { t } = useLanguage();
  const professional = welcome.categories.includes("professional");
  const business = welcome.categories.includes("businessperson");
  if (!professional && !business) return null;
  return (
    <Section title={t.myProfilesTitle}>
      {professional ? (
        <View className="gap-1.5 border-b border-line pb-3">
          <Text className="font-figtree-bold text-[15px] text-ink">{t.categoryProfessional}</Text>
          {profile?.profession ? (
            <Text className="font-figtree text-sm text-ink-2">{profile.profession}</Text>
          ) : null}
          <Text className="font-figtree text-sm text-ink-2">{t.myProfilesCertificates}</Text>
          <LinkButton
            href="/profile/edit"
            label={t.myProfilesAddCertificates}
            className="min-h-[44px] justify-center self-start"
          >
            <Text className="font-figtree-semibold text-sm text-blue">
              {t.myProfilesAddCertificates}
            </Text>
          </LinkButton>
        </View>
      ) : null}
      {business ? (
        <View className="gap-2 pt-1">
          <Text className="font-figtree-bold text-[15px] text-ink">{t.categoryBusinessperson}</Text>
          <Text className="font-figtree text-sm text-ink-2">
            {welcome.businessName ?? t.myProfilesYourBusiness}
          </Text>
          <LevelSteps level={welcome.level} />
          {welcome.level < POSTER_LEVEL ? (
            <>
              <Text className="font-figtree text-sm text-ink-2">{t.myProfilesBusinessHint}</Text>
              <LinkButton
                href="/business"
                label={t.verifyBusinessLink}
                className="min-h-[44px] justify-center self-start"
              >
                <Text className="font-figtree-semibold text-sm text-blue">
                  {t.verifyBusinessLink}
                </Text>
              </LinkButton>
            </>
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

function MatchRow({ match }: { match: ScanMatch }) {
  const { t, language } = useLanguage();
  return (
    <LinkButton
      href={`/opportunities/${match.id}`}
      label={match.title}
      className="gap-1 border-b border-line py-2.5"
    >
      <Text className="font-figtree-semibold text-[15px] text-ink">
        {t[typeLabel[match.type]] as string} · {match.title}
      </Text>
      <Text className="font-figtree text-[13px] text-ink-2">
        {t.oppCloses(closingDay(match.closingAt, language))}
      </Text>
      {match.reasons.length ? (
        <Text className="font-figtree-semibold text-[13px] text-good-text">
          {match.reasons.map((r) => reasonText(t, r)).join(" · ")}
        </Text>
      ) : null}
    </LinkButton>
  );
}

/** Jobs for your skills and Tenders for your business, both from Scan for Opportunities (O07). */
function HomeMatches({ scan, business }: { scan: ScanApi; business: boolean }) {
  const { t } = useLanguage();
  const loaded = useLoad(() => scan.matches().catch(() => [] as ScanMatch[]), 0);
  if (loaded.state !== "ready") return null;
  const jobs = loaded.value.filter((m) => m.type === "job").slice(0, 3);
  const tenders = loaded.value.filter((m) => m.type === "tender").slice(0, 3);
  const more = (label: string) => (
    <LinkButton
      href="/opportunities/scan"
      label={label}
      className="min-h-[44px] justify-center self-start"
    >
      <Text className="font-figtree-semibold text-sm text-blue">{label}</Text>
    </LinkButton>
  );
  return (
    <>
      <Section title={t.jobsForSkillsTitle}>
        <Text className="font-figtree text-[13px] text-ink-2">{t.jobsForSkillsWhy}</Text>
        {jobs.length ? (
          jobs.map((m) => <MatchRow key={m.id} match={m} />)
        ) : (
          <Text className="font-figtree text-sm text-ink-2">{t.homeMatchesEmpty}</Text>
        )}
        {more(t.scanForMore)}
      </Section>
      {business ? (
        <Section title={t.tendersForBusinessTitle}>
          <Text className="font-figtree text-[13px] text-ink-2">{t.tendersForBusinessWhy}</Text>
          {tenders.length ? (
            tenders.map((m) => <MatchRow key={m.id} match={m} />)
          ) : (
            <Text className="font-figtree text-sm text-ink-2">{t.homeMatchesEmpty}</Text>
          )}
          {more(t.scanForMore)}
        </Section>
      ) : null}
    </>
  );
}

/**
 * S08 on the combined canvas (U01). No platform-wide figure is ever loaded (PRD section 7, criterion 1); the widgets
 * show items, never counts.
 */
export function DashboardScreen({
  api,
  connections,
  widgets,
  news,
  people,
  scan,
  profile,
  today = new Date(),
}: {
  api: DashboardApi;
  connections: ConnectionsApi;
  widgets?: DashboardWidgetsApi;
  news?: MemberNewsApi;
  people?: PeopleYouMayKnowApi;
  scan?: ScanApi;
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

  const { welcome } = loaded;
  const requests = (
    <Section title={t.dashboardRequests}>
      <Message text={actionFailed ? t.actionFailed : null} />
      {loaded.received.length ? (
        loaded.received.map((r) => (
          <ReceivedRequestRow
            key={r.requestId}
            request={r}
            onAnswer={(accept) => answer(r.requestId, accept)}
          />
        ))
      ) : (
        <Text className="font-figtree text-[15px] text-ink-2">{t.noRequestsWaiting}</Text>
      )}
    </Section>
  );
  const activity = (
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
  );
  const business = welcome.categories.includes("businessperson");
  const main = (
    <View className="gap-4">
      {me ? <NextSteps profile={me} /> : null}
      <MyProfiles welcome={welcome} profile={me} />
      {people ? <PeopleYouMayKnow api={people} /> : null}
      {scan ? <HomeMatches scan={scan} business={business} /> : null}
      {widgets ? <LatestItems api={widgets} withFeatured={false} /> : null}
    </View>
  );
  const side = (
    <View className="gap-4">
      {requests}
      {activity}
      {widgets ? <FeaturedList api={widgets} /> : null}
      {news ? <NewsPreview api={news} /> : null}
    </View>
  );
  return (
    <View className="gap-4">
      <WelcomeCard welcome={welcome} today={today} />
      {phone ? (
        <View className="gap-4">
          {requests}
          {main}
          {activity}
          {widgets ? <FeaturedList api={widgets} /> : null}
          {news ? <NewsPreview api={news} /> : null}
        </View>
      ) : (
        <View className="flex-row items-start gap-6">
          <View className="min-w-0 flex-1">{main}</View>
          <View className="w-[340px]">{side}</View>
        </View>
      )}
    </View>
  );
}

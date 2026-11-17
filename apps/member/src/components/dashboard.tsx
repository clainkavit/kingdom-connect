import { formatDate, formatDateTime, POSTER_LEVEL, type TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import BookOpen from "lucide-react-native/icons/book-open";
import Briefcase from "lucide-react-native/icons/briefcase";
import Calendar from "lucide-react-native/icons/calendar";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import Lock from "lucide-react-native/icons/lock";
import MapPin from "lucide-react-native/icons/map-pin";
import Plus from "lucide-react-native/icons/plus";
import ScanSearch from "lucide-react-native/icons/scan-search";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Store from "lucide-react-native/icons/store";
import UserPlus from "lucide-react-native/icons/user-plus";
import Svg, { Circle } from "react-native-svg";
import type { Profile } from "../lib/profile";
import { Text, View } from "react-native";
import type { ConnectionsApi, ReceivedRequest, SentRequest } from "../lib/connections";
import type { DashboardApi, MyRegistration, Welcome } from "../lib/dashboard";
import { useLanguage } from "../lib/language";
import type { MyActivity } from "../lib/my-activity";
import type { ScanApi, ScanMatch } from "../lib/scan";
import { PersonRow, ReceivedRequestRow } from "./connections";
import { useLoad } from "./events";
import { Message } from "./form";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { reasonText } from "./scan";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import type { DashboardWidgetsApi } from "../lib/dashboard-widgets";
import type { MemberNewsApi } from "../lib/news";
import type { PeopleYouMayKnowApi } from "../lib/people-you-may-know";
import { FeaturedList, LatestItems, NewsPreview } from "./dashboard-widgets";
import { closingDay } from "./opportunities";
import { typeLabel } from "./opportunity-form";
import { PosterHome } from "./poster-home";
import { usePalette } from "./palette";
import { PeopleYouMayKnow } from "./people-you-may-know";
import { usePhoneHeader } from "./phone-header";
import { usePhone } from "./sheet";

type QuickAction = {
  key: TextKey;
  href: string;
  minLevel: number;
  posts: boolean;
  icon: typeof Lightbulb;
};

const quickActions: QuickAction[] = [
  {
    key: "actionPostOpportunity",
    href: "/opportunities/new",
    minLevel: POSTER_LEVEL,
    posts: true,
    icon: Plus,
  },
  { key: "actionShareIdea", href: "/ideas/new", minLevel: 1, posts: true, icon: Lightbulb },
  { key: "actionScan", href: "/opportunities/scan", minLevel: 1, posts: false, icon: ScanSearch },
  { key: "actionPostTraining", href: "/training", minLevel: 1, posts: true, icon: BookOpen },
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

function Chip({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "good" | "gold" }) {
  const palette = usePalette();
  const colours = {
    neutral: "bg-blue-soft text-navy",
    good: "bg-good-soft text-good-text",
    gold: "bg-warn-soft text-warn-text",
  }[tone];
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${colours.split(" ")[0]}`}
    >
      {tone === "good" ? <ShieldCheck size={12} color={palette.good} aria-hidden /> : null}
      <Text className={`font-figtree-bold text-[12px] ${colours.split(" ")[1]}`}>{text}</Text>
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

/** The canvas welcome: date and place, Welcome with the first name, badges, and the actions on the right. */
function HomeHeader({ welcome, today }: { welcome: Welcome; today: Date }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const place = [welcome.district, welcome.region]
    .filter((p) => p !== null)
    .map((p) => p[language])
    .join(", ");
  const actions = quickActions.filter(
    (a) => welcome.level >= a.minLevel && !(a.posts && welcome.postingPaused),
  );
  const first = welcome.fullName.split(/\s+/)[0] ?? welcome.fullName;
  const badges = (
    <View className="flex-row flex-wrap gap-2">
      <Chip tone="good" text={t.homeVerifiedMember} />
      {welcome.categories
        .filter((c) => categoryLabel[c])
        .map((c) => (
          <Chip key={c} text={t[categoryLabel[c]!] as string} />
        ))}
      {welcome.level >= POSTER_LEVEL ? <Chip tone="gold" text={t.homePosterBadge} /> : null}
    </View>
  );
  const inBand = usePhoneHeader(
    {
      home: true,
      title: t.homeWelcome(first),
      detail: [formatDate(today, language), place].filter(Boolean).join(" · "),
      below: badges,
    },
    phone,
  );
  return (
    <View className="flex-row flex-wrap items-start justify-between gap-4">
      {inBand ? (
        welcome.postingPaused ? (
          <Text className="font-figtree text-sm text-ink-2">{t.postingPausedNote}</Text>
        ) : null
      ) : (
        <View className="min-w-0 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-x-3">
            <Text className="font-figtree text-[13px] text-ink-2">
              {formatDate(today, language)}
            </Text>
            {place ? (
              <View className="flex-row items-center gap-1">
                <MapPin size={13} color={palette.ink2} aria-hidden />
                <Text className="font-figtree text-[13px] text-ink-2">{place}</Text>
              </View>
            ) : null}
          </View>
          <Text
            role="heading"
            aria-level={1}
            className="font-figtree-extrabold text-[32px] leading-[37px] text-navy"
          >
            {t.homeWelcome(first)}
          </Text>
          {badges}
          {welcome.postingPaused ? (
            <Text className="font-figtree text-sm text-ink-2">{t.postingPausedNote}</Text>
          ) : null}
        </View>
      )}
      <View
        className={
          phone ? "w-full flex-row flex-wrap gap-2.5" : "flex-row flex-wrap items-center gap-3"
        }
      >
        {actions.map((a, i) => {
          const primary = i === 0 && a.key === "actionPostOpportunity";
          const Icon = a.icon;
          return (
            <LinkButton
              key={a.href}
              href={a.href}
              label={t[a.key] as string}
              className={`min-h-[48px] flex-row items-center gap-2 ${phone ? (primary ? "w-full justify-center rounded-[14px]" : "min-w-[140px] flex-1 basis-[45%] rounded-[14px]") : "rounded-full"} px-5 ${primary ? "bg-navy" : "border border-line-2 bg-surface"}`}
            >
              <Icon size={18} color={primary ? palette.navyInk : palette.navy} aria-hidden />
              <Text
                className={`font-figtree-semibold text-[14px] ${primary ? "text-white" : "text-navy"}`}
              >
                {t[a.key] as string}
              </Text>
            </LinkButton>
          );
        })}
        {!welcome.postingPaused && welcome.level < POSTER_LEVEL ? (
          <LinkButton
            href="/business"
            label={t.verifyBusinessLink}
            className="min-h-[48px] flex-row items-center gap-2 rounded-full bg-warn-soft px-5"
          >
            <Lock size={16} color={palette.warnText} aria-hidden />
            <Text className="font-figtree-semibold text-[14px] text-warn-text">
              {t.upgradeToPost}
            </Text>
          </LinkButton>
        ) : null}
      </View>
    </View>
  );
}

/** Your profile (canvas): a ring with how complete the profile is, and what is left. */
function YourProfile({ welcome, profile }: { welcome: Welcome; profile: Profile }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const categories = welcome.categories
    .filter((c) => categoryLabel[c])
    .map((c) => t[categoryLabel[c]!] as string)
    .join(", ");
  const steps = [
    { done: true, label: t.homeStepIdentity },
    { done: welcome.categories.length > 0, label: t.homeStepCategories(categories) },
    {
      done: Boolean(profile.profession),
      label: profile.profession ? t.homeStepProfession(profile.profession) : t.stepProfession,
    },
    { done: Boolean(profile.headline && profile.bio), label: t.homeStepHeadline },
    { done: profile.skills.length >= 3, label: t.homeStepSkills },
    { done: Boolean(profile.photoUrl), label: t.stepPhoto },
  ];
  const done = steps.filter((s) => s.done).length;
  const percent = Math.round((done / steps.length) * 100);
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <Section title={t.homeYourProfile} action={{ label: t.editProfile, href: "/profile/edit" }}>
      <View className="flex-row flex-wrap items-center gap-6">
        <View className="h-24 w-24 items-center justify-center">
          <Svg width={96} height={96} style={{ position: "absolute" }} aria-hidden>
            <Circle cx={48} cy={48} r={r} stroke={palette.blueSoft} strokeWidth={10} fill="none" />
            <Circle
              cx={48}
              cy={48}
              r={r}
              stroke={palette.navy}
              strokeWidth={10}
              fill="none"
              strokeDasharray={`${(c * percent) / 100} ${c}`}
              strokeLinecap="round"
              transform="rotate(-90 48 48)"
            />
          </Svg>
          <Text className="font-figtree-extrabold text-[20px] text-ink">{percent}%</Text>
          <Text className="font-figtree text-[11px] text-ink-2">{t.homeComplete}</Text>
        </View>
        <View className="min-w-[200px] flex-1 gap-2">
          {steps.map((s) => (
            <View key={s.label} className="flex-row items-center gap-2.5">
              <View
                className={`h-5 w-5 items-center justify-center rounded-full ${s.done ? "bg-good-soft" : "border-[1.5px] border-line-2"}`}
              >
                {s.done ? <Check size={12} color={palette.good} aria-hidden /> : null}
              </View>
              <Text className="font-figtree text-[14px] text-ink">{s.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {done < steps.length ? (
        <LinkButton
          href="/profile/edit"
          label={t.homeCompleteProfile}
          className="min-h-[44px] items-center justify-center rounded-full bg-navy px-5"
        >
          <Text className="font-figtree-semibold text-[15px] text-white">
            {t.homeCompleteProfile}
          </Text>
        </LinkButton>
      ) : null}
    </Section>
  );
}

function LevelSteps({ level }: { level: number }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View className="flex-row items-start">
      {[1, 2, 3].map((n) => (
        <View key={n} className="flex-1 flex-row items-start">
          <View className="items-center gap-1">
            <View
              className={`h-7 w-7 items-center justify-center rounded-full ${n <= level ? "bg-navy" : "border-[1.5px] border-line-2 bg-surface"}`}
            >
              {n <= level ? (
                <Check size={14} color={palette.navyInk} aria-hidden />
              ) : (
                <Text className="font-figtree-bold text-[12px] text-ink-2">{n}</Text>
              )}
            </View>
            <Text
              className={`text-[12px] ${n <= level ? "font-figtree-bold text-ink" : "font-figtree text-ink-2"}`}
            >
              {t.myProfilesLevel(n)}
            </Text>
          </View>
          {n < 3 ? <View className="mx-2 mt-3.5 h-px flex-1 bg-line-2" /> : null}
        </View>
      ))}
    </View>
  );
}

/** My profiles (canvas): a card for each category the member ticked, side by side. */
function MyProfiles({ welcome, profile }: { welcome: Welcome; profile: Profile | null }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const professional = welcome.categories.includes("professional");
  const business = welcome.categories.includes("businessperson");
  if (!professional && !business) return null;
  return (
    <Section title={t.myProfilesTitle}>
      <View className="flex-row flex-wrap gap-3">
        {professional ? (
          <View className="min-w-[220px] flex-1 gap-2 rounded-[18px] border border-line bg-surface-2 p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-navy">
                <Briefcase size={18} color={palette.navyInk} aria-hidden />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-figtree-bold text-[15px] text-ink">
                  {t.categoryProfessional}
                </Text>
                {profile?.profession ? (
                  <Text className="font-figtree text-[13px] text-ink-2">{profile.profession}</Text>
                ) : null}
              </View>
            </View>
            <View className="flex-row flex-wrap gap-1.5">
              <Chip tone="good" text={t.homeVerifiedIdentity} />
            </View>
            <Text className="font-figtree text-[13px] leading-5 text-ink">
              {t.myProfilesCertificates}
            </Text>
            <LinkButton
              href="/profile/edit"
              label={t.myProfilesAddCertificates}
              className="min-h-[40px] items-center justify-center rounded-full border border-line-2 bg-surface px-4"
            >
              <Text className="font-figtree-semibold text-[14px] text-navy">
                {t.myProfilesAddCertificates}
              </Text>
            </LinkButton>
          </View>
        ) : null}
        {business ? (
          <View className="min-w-[220px] flex-1 gap-3 rounded-[18px] border border-line bg-surface-2 p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-warn-soft">
                <Store size={18} color={palette.warnText} aria-hidden />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-figtree-bold text-[15px] text-ink">
                  {t.categoryBusinessperson}
                </Text>
                <Text className="font-figtree text-[13px] text-ink-2">
                  {welcome.businessName ?? t.myProfilesYourBusiness}
                </Text>
              </View>
            </View>
            <LevelSteps level={welcome.level} />
            {welcome.level < POSTER_LEVEL ? (
              <>
                <Text className="font-figtree text-[13px] leading-5 text-ink">
                  {t.myProfilesBusinessHint}
                </Text>
                <LinkButton
                  href="/business"
                  label={t.verifyBusinessLink}
                  className="min-h-[40px] items-center justify-center rounded-full bg-navy px-4"
                >
                  <Text className="font-figtree-semibold text-[14px] text-white">
                    {t.verifyBusinessLink}
                  </Text>
                </LinkButton>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function MatchRow({ match }: { match: ScanMatch }) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const Icon = match.type === "tender" ? Store : Briefcase;
  const place = [match.district, match.region]
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => (language === "sw" ? p.sw : p.en))
    .join(", ");
  return (
    <LinkButton
      href={`/opportunities/${match.id}`}
      label={match.title}
      className="flex-row gap-3 border-t border-line pt-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-blue-soft">
        <Icon size={18} color={palette.navy} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-figtree-bold text-[15px] text-ink">
          {t[typeLabel[match.type]] as string} · {match.title}
        </Text>
        <Text className="font-figtree text-[13px] text-ink-2">
          {[place || null, t.oppCloses(closingDay(match.closingAt, language))]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {match.reasons.map((r, i) => (
          <View key={i} className="flex-row items-center gap-1.5">
            <Check size={13} color={palette.good} aria-hidden />
            <Text className="font-figtree text-[13px] text-good-text">{reasonText(t, r)}</Text>
          </View>
        ))}
      </View>
      <ChevronRight size={18} color={palette.ink} aria-hidden />
    </LinkButton>
  );
}

/** Jobs for your skills and Tenders for your business, side by side, both from Scan (O07). */
function HomeMatches({ scan, business }: { scan: ScanApi; business: boolean }) {
  const { t } = useLanguage();
  const phone = usePhone();
  const loaded = useLoad(() => scan.matches().catch(() => [] as ScanMatch[]), 0);
  if (loaded.state !== "ready") return null;
  const jobs = loaded.value.filter((m) => m.type === "job").slice(0, 3);
  const tenders = loaded.value.filter((m) => m.type === "tender").slice(0, 3);
  return (
    <View className={phone ? "gap-4" : "flex-row items-start gap-4"}>
      <View className="min-w-0 flex-1">
        <Section
          title={t.jobsForSkillsTitle}
          action={{ label: t.scanForMore, href: "/opportunities/scan" }}
        >
          <Text className="font-figtree text-[13px] text-ink-2">{t.jobsForSkillsWhy}</Text>
          {jobs.length ? (
            jobs.map((m) => <MatchRow key={m.id} match={m} />)
          ) : (
            <Text className="font-figtree text-sm text-ink-2">{t.homeMatchesEmpty}</Text>
          )}
        </Section>
      </View>
      {business ? (
        <View className="min-w-0 flex-1">
          <Section
            title={t.tendersForBusinessTitle}
            action={{ label: t.homeAllTenders, href: "/opportunities" }}
          >
            <Text className="font-figtree text-[13px] text-ink-2">{t.tendersForBusinessWhy}</Text>
            {tenders.length ? (
              tenders.map((m) => <MatchRow key={m.id} match={m} />)
            ) : (
              <Text className="font-figtree text-sm text-ink-2">{t.homeMatchesEmpty}</Text>
            )}
          </Section>
        </View>
      ) : null}
    </View>
  );
}

function ActivityRow({
  icon: Icon,
  label,
  count,
  href,
}: {
  icon: typeof Lightbulb;
  label: string;
  count: number;
  href: string;
}) {
  const palette = usePalette();
  return (
    <LinkButton
      href={href}
      label={`${label}: ${count}`}
      className="min-h-[44px] flex-row items-center gap-3 border-t border-line"
    >
      <Icon size={17} color={palette.ink2} aria-hidden />
      <Text className="flex-1 font-figtree text-[14px] text-ink">{label}</Text>
      <Text className="font-figtree-extrabold text-[15px] text-ink">{count}</Text>
      <ChevronRight size={16} color={palette.ink} aria-hidden />
    </LinkButton>
  );
}

/**
 * S08 on the combined canvas (U01, rebuilt to the board Member-Dashboard in V04). No platform-wide figure is ever
 * loaded (PRD section 7, criterion 1); the only counts are the member's own activity.
 */
export function DashboardScreen({
  api,
  connections,
  widgets,
  news,
  people,
  scan,
  profile,
  activity,
  poster,
  today = new Date(),
}: {
  api: DashboardApi;
  connections: ConnectionsApi;
  widgets?: DashboardWidgetsApi;
  news?: MemberNewsApi;
  people?: PeopleYouMayKnowApi;
  scan?: ScanApi;
  profile?: () => Promise<Profile | null>;
  activity?: () => Promise<MyActivity>;
  poster?: React.ComponentProps<typeof PosterHome>["api"];
  today?: Date;
}) {
  const { t } = useLanguage();
  const phone = usePhone();
  const [me, setMe] = useState<Profile | null>(null);
  const mine = useLoad(() => activity?.().catch(() => null) ?? Promise.resolve(null), 0);

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
    <Section title={t.dashboardRequests} action={{ label: t.homeSeeAll, href: "/connections" }}>
      <Message text={actionFailed ? t.actionFailed : null} />
      {loaded.received.length ? (
        <>
          <Text className="font-figtree text-[13px] text-ink-2">
            {t.homeWaitingForYou(loaded.received.length)}
          </Text>
          {loaded.received.map((r) => (
            <ReceivedRequestRow
              key={r.requestId}
              request={r}
              onAnswer={(accept) => answer(r.requestId, accept)}
            />
          ))}
        </>
      ) : (
        <Text className="font-figtree text-[15px] text-ink-2">{t.noRequestsWaiting}</Text>
      )}
    </Section>
  );
  const counts = mine.state === "ready" ? mine.value : null;
  const anything =
    loaded.sent.length > 0 ||
    loaded.registrations.length > 0 ||
    Boolean(counts && (counts.applications || counts.ideaRequests));
  const activityCard = (
    <Section
      title={t.myActivity}
      action={{ label: t.homeSeeAll, href: "/opportunities/responses" }}
    >
      {anything ? (
        <View>
          <ActivityRow
            icon={UserPlus}
            label={t.homeRequestsSent}
            count={loaded.sent.length}
            href="/connections"
          />
          <ActivityRow
            icon={Briefcase}
            label={t.homeApplications}
            count={counts?.applications ?? 0}
            href="/opportunities/responses"
          />
          <ActivityRow
            icon={Lightbulb}
            label={t.homeIdeaRequests}
            count={counts?.ideaRequests ?? 0}
            href="/ideas"
          />
          <ActivityRow
            icon={Calendar}
            label={t.homeTrainingEvents}
            count={loaded.registrations.length}
            href="/training"
          />
          {loaded.registrations.length ? (
            <View className="border-t border-line pt-1.5">
              {loaded.registrations.map((r) => (
                <RegistrationRow key={`${r.kind}-${r.id}`} item={r} />
              ))}
            </View>
          ) : null}
          {loaded.sent.map((r) => (
            <PersonRow key={r.requestId} person={r}>
              <Text className="font-figtree text-sm text-ink-2">{t.requestSent}</Text>
            </PersonRow>
          ))}
          {counts?.latestApplication ? (
            <View className="flex-row items-center justify-between gap-2 border-t border-line pt-3">
              <Text className="flex-1 font-figtree text-[14px] text-ink">
                {counts.latestApplication.title}
              </Text>
              <Text className="rounded-full bg-good-soft px-2.5 py-1 font-figtree-bold text-[12px] text-good-text">
                {t.homeResponseStatus(counts.latestApplication.status)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState title={t.activityEmptyTitle} message={t.activityEmptyMessage} />
      )}
    </Section>
  );
  const business = welcome.categories.includes("businessperson");
  const two = phone ? "gap-4" : "flex-row items-start gap-4";
  return (
    <View className="gap-4">
      <HomeHeader welcome={welcome} today={today} />
      <View className={two}>
        {me ? (
          <View className="min-w-0 flex-1">
            <YourProfile welcome={welcome} profile={me} />
          </View>
        ) : null}
        <View className="min-w-0 flex-1">
          <MyProfiles welcome={welcome} profile={me} />
        </View>
      </View>
      {poster && welcome.level >= POSTER_LEVEL ? <PosterHome api={poster} /> : null}
      {phone ? requests : null}
      {people ? <PeopleYouMayKnow api={people} /> : null}
      {scan ? <HomeMatches scan={scan} business={business} /> : null}
      <View className={two}>
        <View className="min-w-0 flex-1 gap-4">
          {widgets ? <LatestItems api={widgets} withFeatured={false} /> : null}
        </View>
        <View className={phone ? "gap-4" : "w-[388px] gap-4"}>
          {phone ? null : requests}
          {activityCard}
        </View>
      </View>
      <View className={two}>
        <View className="min-w-0 flex-1">{widgets ? <FeaturedList api={widgets} /> : null}</View>
        <View className={phone ? "" : "w-[388px]"}>{news ? <NewsPreview api={news} /> : null}</View>
      </View>
    </View>
  );
}

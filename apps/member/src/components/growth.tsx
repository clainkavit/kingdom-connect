import Calendar from "lucide-react-native/icons/calendar";
import Flag from "lucide-react-native/icons/flag";
import GraduationCap from "lucide-react-native/icons/graduation-cap";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import { useState } from "react";
import { Text, View } from "react-native";
import type { EventItem, EventsApi } from "../lib/events";
import { useLanguage } from "../lib/language";
import type { PlansApi, PlanSummary } from "../lib/plans";
import type { TrainingApi, TrainingItem } from "../lib/training";
import { useLoad } from "./events";
import { Chips } from "./form";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";
import { EmptyState, LoadingRows } from "./states";

type Upcoming = {
  key: string;
  kind: "event" | "training";
  id: string;
  title: string;
  startsAt: Date | null;
  where: string | null;
  going: boolean;
  waitlist: number | null;
  seatsLeft: number | null;
};

type Show = "all" | "going" | "past";

const DAY = 86_400_000;
const tzDay = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

function fromEvent(e: EventItem): Upcoming {
  return {
    key: `event-${e.id}`,
    kind: "event",
    id: e.id,
    title: e.title,
    startsAt: new Date(e.startsAt),
    where: e.venue,
    going: e.myStatus === "registered",
    waitlist: e.myStatus === "waitlisted" ? e.myWaitlistPosition : null,
    seatsLeft: e.capacity > 0 ? Math.max(0, e.capacity - e.registered) : null,
  };
}

function fromTraining(item: TrainingItem, online: string): Upcoming {
  return {
    key: `training-${item.id}`,
    kind: "training",
    id: item.id,
    title: item.title,
    startsAt: item.startsAt ? new Date(item.startsAt) : null,
    where: item.format === "online" ? online : item.venue,
    going: item.myStatus === "registered",
    waitlist: item.myStatus === "waitlisted" ? item.myWaitlistPosition : null,
    seatsLeft: item.seats > 0 ? Math.max(0, item.seats - item.registered) : null,
  };
}

function DateTile({ at, kind }: { at: Date | null; kind: Upcoming["kind"] }) {
  const { language } = useLanguage();
  const tone = kind === "training" ? "bg-teal-soft" : "bg-blue-soft";
  const text = kind === "training" ? "text-teal" : "text-navy";
  const month = at
    ? new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-TZ", {
        month: "short",
        timeZone: "Africa/Dar_es_Salaam",
      }).format(at)
    : "";
  const day = at
    ? new Intl.DateTimeFormat("en-TZ", { day: "numeric", timeZone: "Africa/Dar_es_Salaam" }).format(
        at,
      )
    : "·";
  return (
    <View className={`h-14 w-14 items-center justify-center rounded-[12px] ${tone}`}>
      <Text className={`font-figtree-bold text-[11px] uppercase ${text}`}>{month}</Text>
      <Text className={`font-figtree-extrabold text-[22px] leading-[24px] ${text}`}>{day}</Text>
    </View>
  );
}

function UpcomingRow({ item, last }: { item: Upcoming; last: boolean }) {
  const { t, language } = useLanguage();
  const when = item.startsAt
    ? new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-TZ", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "Africa/Dar_es_Salaam",
      }).format(item.startsAt)
    : t.trainingSelfPaced;
  const href = item.kind === "training" ? `/training/${item.id}` : `/events/${item.id}`;
  return (
    <LinkButton
      href={href}
      label={item.title}
      className={`flex-row items-center gap-4 px-[18px] py-4 ${last ? "" : "border-b border-line"}`}
    >
      <DateTile at={item.startsAt} kind={item.kind} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={`font-figtree-bold text-[12px] uppercase tracking-wide ${item.kind === "training" ? "text-teal" : "text-navy"}`}
        >
          {item.kind === "training" ? t.myActivityTraining : t.myActivityEvent}
        </Text>
        <Text className="font-figtree-bold text-[16px] text-ink">{item.title}</Text>
        <Text className="font-figtree text-[14px] text-ink-2">
          {[when, item.where].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {item.going ? (
        <Text className="rounded-full bg-good-soft px-2.5 py-1 font-figtree-bold text-[12px] text-good-text">
          {t.growthGoing}
        </Text>
      ) : item.waitlist !== null ? (
        <Text className="rounded-full bg-warn-soft px-2.5 py-1 font-figtree-bold text-[12px] text-warn-text">
          {t.growthWaitlist(item.waitlist)}
        </Text>
      ) : item.seatsLeft !== null && item.seatsLeft <= 10 ? (
        <Text className="rounded-full bg-warn-soft px-2.5 py-1 font-figtree-bold text-[12px] text-warn-text">
          {item.seatsLeft === 0 ? t.growthFull : t.growthSeatsLeft(item.seatsLeft)}
        </Text>
      ) : (
        <View className="min-h-[36px] justify-center rounded-full border border-navy px-4">
          <Text className="font-figtree-semibold text-[13px] text-navy">{t.growthRegister}</Text>
        </View>
      )}
    </LinkButton>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5 rounded-card border border-line bg-surface px-5 py-5">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Progress({ value, tone }: { value: number; tone: "navy" | "teal" }) {
  return (
    <View
      className={`h-2 overflow-hidden rounded-full ${tone === "teal" ? "bg-teal-soft" : "bg-blue-soft"}`}
    >
      <View
        className={`h-2 rounded-full ${tone === "teal" ? "bg-teal" : "bg-navy"}`}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </View>
  );
}

const sections = [
  {
    key: "navEvents",
    hint: "growthEventsHint",
    href: "/events",
    icon: Calendar,
    tone: "bg-blue-soft",
    fg: "navy",
  },
  {
    key: "navTraining",
    hint: "growthTrainingHint",
    href: "/training",
    icon: GraduationCap,
    tone: "bg-teal-soft",
    fg: "teal",
  },
  {
    key: "navIdeas",
    hint: "growthIdeasHint",
    href: "/ideas",
    icon: Lightbulb,
    tone: "bg-warn-soft",
    fg: "warnText",
  },
  {
    key: "navPlans",
    hint: "growthPlansHint",
    href: "/plans",
    icon: Flag,
    tone: "bg-violet-soft",
    fg: "violet",
  },
] as const;

/** Growth, rebuilt to the canvas board Web-Growth (V08): sections, what is coming up, and your own progress. */
export function GrowthScreen({
  events,
  training,
  plans,
  now = new Date(),
}: {
  events: EventsApi;
  training: TrainingApi;
  plans: PlansApi;
  now?: Date;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [show, setShow] = useState<Show>("all");
  const feed = useLoad(async () => {
    const [ev, tr] = await Promise.all([
      events.feed().catch(() => [] as EventItem[]),
      training.feed().catch(() => [] as TrainingItem[]),
    ]);
    return {
      items: [
        ...ev.filter((e) => e.status === "published").map(fromEvent),
        ...tr.filter((x) => x.status === "published").map((x) => fromTraining(x, t.trainingOnline)),
      ],
      training: tr,
    };
  }, 0);
  const mine = useLoad(() => plans.mine().catch(() => [] as PlanSummary[]), 0);

  const today = tzDay(now);
  const items =
    feed.state === "ready"
      ? feed.value.items
          .filter((i) => {
            const past = i.startsAt !== null && tzDay(i.startsAt) < today;
            if (show === "past") return past;
            if (past) return false;
            return show === "going" ? i.going || i.waitlist !== null : true;
          })
          .sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity))
      : [];
  const groupOf = (i: Upcoming) => {
    if (!i.startsAt) return t.growthAnyTime;
    const days = Math.floor(
      (new Date(`${tzDay(i.startsAt)}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        DAY,
    );
    if (days < 0) return t.growthPast;
    if (days === 0) return t.growthToday;
    if (days < 7) return t.growthThisWeek;
    if (days < 14) return t.growthNextWeek;
    return t.growthLater;
  };
  const groups: { title: string; items: Upcoming[] }[] = [];
  for (const i of items) {
    const title = groupOf(i);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(i);
    else groups.push({ title, items: [i] });
  }

  const plan = mine.state === "ready" ? mine.value.find((p) => p.status === "active") : undefined;
  const joined =
    feed.state === "ready"
      ? feed.value.training.find((x) => x.myStatus === "registered")
      : undefined;

  const side = (
    <View className={phone ? "gap-4" : "w-[280px] gap-4"}>
      {plan ? (
        <SideCard title={t.growthYourPlan}>
          <Text className="font-figtree text-[13px] text-ink-2">
            {t.growthPlanWith(plan.itemTitle, plan.otherName)}
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="font-figtree text-[13px] text-ink-2">
              {t.growthStepsDone(plan.confirmed, plan.milestones)}
            </Text>
          </View>
          <Progress value={plan.milestones ? plan.confirmed / plan.milestones : 0} tone="navy" />
          <LinkButton
            href={`/plans/${plan.id}`}
            label={t.growthOpenPlan}
            className="-my-1.5 min-h-[44px] justify-center self-start"
          >
            <Text className="font-figtree-semibold text-[14px] text-navy underline">
              {t.growthOpenPlan}
            </Text>
          </LinkButton>
        </SideCard>
      ) : null}
      {joined ? (
        <SideCard title={t.growthTrainingJoined}>
          <Text className="font-figtree-bold text-[15px] text-ink">{joined.title}</Text>
          <Text className="font-figtree text-[13px] text-ink-2">{joined.provider}</Text>
          <LinkButton
            href={`/training/${joined.id}`}
            label={t.growthCourseMaterials}
            className="-my-1.5 min-h-[44px] justify-center self-start"
          >
            <Text className="font-figtree-semibold text-[14px] text-navy underline">
              {t.growthCourseMaterials}
            </Text>
          </LinkButton>
        </SideCard>
      ) : null}
      <View className="gap-2 rounded-card border border-line bg-surface-2 px-5 py-5">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
          {t.growthHaveIdea}
        </Text>
        <Text className="font-figtree text-[14px] leading-[21px] text-ink-2">
          {t.growthHaveIdeaText}
        </Text>
        <LinkButton
          href="/ideas/new"
          label={t.ideasShare}
          className="-my-1.5 min-h-[44px] justify-center self-start"
        >
          <Text className="font-figtree-semibold text-[14px] text-navy underline">
            {t.ideasShare}
          </Text>
        </LinkButton>
      </View>
    </View>
  );

  return (
    <View className="w-full max-w-[1280px] gap-5 self-center">
      <View className="gap-1">
        <Text
          role="heading"
          aria-level={1}
          className={`font-figtree-extrabold text-ink ${phone ? "text-[24px] leading-[29px]" : "text-[30px] leading-[36px]"}`}
        >
          {t.navGrowth}
        </Text>
        {phone ? null : (
          <Text className="font-figtree text-[15px] text-ink-2">{t.growthIntro}</Text>
        )}
      </View>
      <View role="navigation" aria-label={t.growthSections} className="flex-row flex-wrap gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <LinkButton
              key={s.href}
              href={s.href}
              label={t[s.key]}
              className={`rounded-[14px] border border-line bg-surface ${phone ? "w-[48%] flex-grow gap-2.5 px-4 py-4" : "min-w-[220px] flex-1 flex-row items-center gap-3.5 px-[18px] py-4"}`}
            >
              <View
                className={`h-[42px] w-[42px] items-center justify-center rounded-[12px] ${s.tone}`}
              >
                <Icon size={22} color={palette[s.fg]} aria-hidden />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-figtree-bold text-[16px] text-ink">{t[s.key]}</Text>
                <Text className="font-figtree text-[13px] leading-[18px] text-ink-2">
                  {t[s.hint]}
                </Text>
              </View>
            </LinkButton>
          );
        })}
      </View>
      <View className={phone ? "gap-4" : "flex-row items-start gap-6"}>
        <View className="min-w-0 flex-1 gap-3">
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <Text
              role="heading"
              aria-level={2}
              className="font-figtree-extrabold text-[20px] text-ink"
            >
              {t.growthComingUp}
            </Text>
            <Chips
              hideLabel
              label={t.growthShow}
              options={[
                { value: "all", label: t.oppAll },
                { value: "going", label: t.growthGoing },
                { value: "past", label: t.growthPast },
              ]}
              value={show}
              onChange={(v) => setShow(v as Show)}
            />
          </View>
          {feed.state === "loading" ? (
            <LoadingRows />
          ) : groups.length === 0 ? (
            <EmptyState title={t.growthNothingTitle} message={t.growthNothingHint} />
          ) : (
            groups.map((g) => (
              <View key={g.title} className="gap-2">
                <Text className="font-figtree-bold text-[14px] text-ink">{g.title}</Text>
                <View className="overflow-hidden rounded-card border border-line bg-surface">
                  {g.items.map((item, i) => (
                    <UpcomingRow key={item.key} item={item} last={i === g.items.length - 1} />
                  ))}
                </View>
              </View>
            ))
          )}
          <LinkButton
            href="/events"
            label={t.growthSeeAll}
            className="min-h-[36px] justify-center self-start"
          >
            <Text className="font-figtree-semibold text-[15px] text-navy underline">
              {t.growthSeeAll}
            </Text>
          </LinkButton>
        </View>
        {side}
      </View>
    </View>
  );
}

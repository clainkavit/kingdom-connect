import { formatDate, IDEA_STAGES, type IdeaStage, type Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  LATEST_TABS,
  type DashboardWidgetsApi,
  type LatestItem,
  type LatestTab,
} from "../lib/dashboard-widgets";
import { useLanguage } from "../lib/language";
import type { MemberNewsApi } from "../lib/news";
import type { PostKind } from "../lib/opportunity-browse";
import { useLoad } from "./events";
import { Chips } from "./form";
import { stageLabel } from "./ideas";
import { LinkButton } from "./link-button";
import { closingDay } from "./opportunities";
import { typeLabel } from "./opportunity-form";
import { Section } from "./profile";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const tabLabel = (t: Strings, tab: LatestTab): string =>
  ({
    all: t.oppAll,
    jobs: t.latestJobs,
    training: t.navTraining,
    tenders: t.latestTenders,
    investments: t.latestInvestments,
    ideas: t.navIdeas,
  })[tab];

const hrefOf = (item: LatestItem) =>
  item.kind === "opportunity"
    ? `/opportunities/${item.id}`
    : item.kind === "training"
      ? `/training/${item.id}`
      : `/ideas/${item.id}`;

function kindLine(t: Strings, item: LatestItem): string {
  if (item.kind === "opportunity" && item.subtype)
    return t[typeLabel[item.subtype as PostKind] ?? "navOpportunities"] as string;
  if (item.kind === "training")
    return `${t.navTraining} · ${item.subtype === "online" ? t.trainingOnline : t.trainingInPerson}`;
  if (item.kind === "idea" && (IDEA_STAGES as readonly string[]).includes(item.subtype ?? ""))
    return `${t.latestIdea} · ${stageLabel(t, item.subtype as IdeaStage)}`;
  return item.kind === "idea" ? t.latestIdea : t.navTraining;
}

function ItemLink({ href, title, line }: { href: string; title: string; line: string }) {
  return (
    <LinkButton href={href} label={title} className="gap-0.5 border-b border-line py-2.5">
      <Text className="font-figtree-semibold text-[15px] text-ink">{title}</Text>
      <Text className="font-figtree text-[13px] text-ink-2">{line}</Text>
    </LinkButton>
  );
}

/** S08: open featured posts, up to 5 (D01, O05). */
export function FeaturedOpportunities({ api }: { api: DashboardWidgetsApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.featured(), attempt);
  return (
    <Section title={t.featuredTitle}>
      {loaded.state === "failed" ? (
        <ErrorState message={t.widgetLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={2} />
      ) : loaded.value.length === 0 ? (
        <EmptyState
          title={t.featuredEmpty}
          message={t.featuredEmptyHint}
          action={{ label: t.navOpportunities, href: "/opportunities" }}
        />
      ) : (
        loaded.value.map((p) => (
          <ItemLink
            key={p.id}
            href={`/opportunities/${p.id}`}
            title={p.title}
            line={[
              t[typeLabel[p.type]] as string,
              p.posterName,
              t.oppCloses(closingDay(p.closingAt, language)),
            ].join(" · ")}
          />
        ))
      )}
    </Section>
  );
}

/** S08: the newest open items, by tab (D01). */
export function LatestItems({ api }: { api: DashboardWidgetsApi }) {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<LatestTab>("all");
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.latest(tab), attempt);
  const choose = (next: LatestTab) => {
    setTab(next);
    setAttempt((a) => a + 1);
  };
  return (
    <Section title={t.latestTitle}>
      <Chips
        label={t.latestShow}
        options={LATEST_TABS.map((k) => ({ value: k, label: tabLabel(t, k) }))}
        value={tab}
        onChange={(k) => choose(k as LatestTab)}
      />
      {loaded.state === "failed" ? (
        <ErrorState message={t.widgetLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={2} />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.latestEmpty} message={t.latestEmptyHint} />
      ) : (
        loaded.value.map((item) => (
          <ItemLink
            key={`${item.kind}-${item.id}`}
            href={hrefOf(item)}
            title={item.title}
            line={[
              kindLine(t, item),
              item.sector ? (language === "sw" ? item.sector.sw : item.sector.en) : null,
              item.publishedAt ? formatDate(item.publishedAt, language) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))
      )}
    </Section>
  );
}

/** S08: the newest news, pinned first, with a link to all of it (D01, T04). */
export function NewsPreview({ api }: { api: MemberNewsApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.list(), attempt);
  return (
    <Section title={t.newsTitle}>
      {loaded.state === "failed" ? (
        <ErrorState message={t.widgetLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={2} />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.newsEmptyWidget} message={t.newsEmptyWidgetHint} />
      ) : (
        <View>
          {loaded.value.slice(0, 3).map((n) => (
            <ItemLink
              key={n.id}
              href="/news"
              title={n.title}
              line={formatDate(new Date(n.publishedAt), language)}
            />
          ))}
          <LinkButton href="/news" label={t.newsAll} className="min-h-[44px] justify-center">
            <Text className="font-figtree-semibold text-sm text-blue">{t.newsAll}</Text>
          </LinkButton>
        </View>
      )}
    </Section>
  );
}

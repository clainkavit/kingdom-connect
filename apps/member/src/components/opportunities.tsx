import {
  employmentTypes,
  formatDate,
  type EmploymentType,
  type Language,
  type Strings,
  type TextKey,
} from "@kingdom-connect/shared";
import { useState } from "react";
import Bookmark from "lucide-react-native/icons/bookmark";
import Plus from "lucide-react-native/icons/plus";
import { Linking, Pressable, Text, View } from "react-native";
import type { JobAlertsApi } from "../lib/job-alerts";
import { useLanguage } from "../lib/language";
import { useSavedPosts } from "../lib/saved-posts";
import {
  OPPORTUNITY_PAGE,
  type OpportunityBrowseApi,
  type OpportunityCard,
  type OpportunityDetail,
  type OpportunityFilters,
  type PostKind,
  type TenderDetails,
} from "../lib/opportunity-browse";
import { useLoad } from "./events";
import { Button, ChoiceList, Chips, Message } from "./form";
import { ClearAll, FilterBar, FilterMenu, FilterOptions, SearchBox } from "./filter-menu";
import { FilterSheet } from "./filter-sheet";
import { stickToBottom, usePhone } from "./sheet";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { AlertSwitch } from "./job-alerts";
import { typeLabel } from "./opportunity-form";
import { YourSkillsForPost, type MySkillsApi } from "./your-skills";
import { ReportLink } from "./report-link";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const KINDS: PostKind[] = ["job", "partnership", "collaboration", "investment", "tender"];

const employmentLabel: Record<EmploymentType, TextKey> = {
  full_time: "empFullTime",
  part_time: "empPartTime",
  contract: "empContract",
  internship: "empInternship",
};

const POSTED_WITHIN = [1, 7, 30] as const;

const named = (n: { en: string; sw: string }, language: Language) =>
  language === "sw" ? n.sw : n.en;

/** A closing date (YYYY-MM-DD, Tanzania) as the reader's day. */
export const closingDay = (date: string, language: Language) =>
  formatDate(new Date(`${date}T12:00:00+03:00`), language);

export function placeLine(t: Strings, post: OpportunityCard, language: Language): string {
  if (post.remote) return t.oppRemote;
  return [post.district, post.region]
    .filter((n): n is { en: string; sw: string } => n !== null)
    .map((n) => named(n, language))
    .join(", ");
}

function roleLine(t: Strings, post: OpportunityCard): string | null {
  const parts = [
    post.role,
    post.employmentType ? (t[employmentLabel[post.employmentType]] as string) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function Badge({ text, tone = "plain" }: { text: string; tone?: "plain" | "gold" }) {
  return (
    <Text
      className={`self-start rounded-full px-2.5 py-0.5 font-figtree-bold text-[12px] ${tone === "gold" ? "bg-warn-soft text-warn-text" : "bg-surface-2 text-ink-2"}`}
    >
      {text}
    </Text>
  );
}

/** O10: the bookmark that saves a post; with words on the post page, an icon alone on a card. */
export function SaveButton({
  saved,
  title,
  onPress,
  withWords,
}: {
  saved: boolean;
  title: string;
  onPress: () => void;
  withWords?: boolean;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <Pressable
      role="button"
      aria-label={saved ? t.oppUnsaveThis(title) : t.oppSaveThis(title)}
      aria-pressed={saved}
      onPress={onPress}
      className={`min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-[10px] ${withWords ? "border border-line bg-surface px-3" : ""}`}
    >
      <Bookmark
        size={20}
        color={palette.navy}
        fill={saved ? palette.navy : "transparent"}
        aria-hidden
      />
      {withWords ? (
        <Text className="font-figtree-semibold text-sm text-ink">
          {saved ? t.oppSavedLabel : t.oppSave}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function OpportunityCardView({
  post,
  saved,
  onToggleSave,
}: {
  post: OpportunityCard;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  const { t, language } = useLanguage();
  const role = roleLine(t, post);
  const card = (
    <LinkButton
      href={`/opportunities/${post.id}`}
      label={post.title}
      className="gap-1.5 rounded-card border border-line bg-surface p-4"
    >
      <View className="flex-row flex-wrap gap-2">
        <Badge text={t[typeLabel[post.type]] as string} />
        {post.featured ? <Badge tone="gold" text={t.oppFeatured} /> : null}
        {post.isMine ? <Badge text={t.oppYours} /> : null}
      </View>
      <Text className="font-figtree-bold text-[16px] text-ink">{post.title}</Text>
      {role ? <Text className="font-figtree text-[14px] text-ink">{role}</Text> : null}
      {post.skillsTotal && post.skillsMatched !== undefined ? (
        <Text className="font-figtree-semibold text-[13px] text-good-text">
          {t.oppSkillsMatch(post.skillsMatched, post.skillsTotal)}
        </Text>
      ) : null}
      <Text className="font-figtree text-[13px] text-ink-2">
        {[post.posterName, placeLine(t, post, language), named(post.sector, language)]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {t.oppCloses(closingDay(post.closingAt, language))}
      </Text>
    </LinkButton>
  );
  if (!onToggleSave) return card;
  return (
    <View className="relative">
      {card}
      <View style={{ position: "absolute", top: 6, right: 6 }}>
        <SaveButton saved={Boolean(saved)} title={post.title} onPress={onToggleSave} />
      </View>
    </View>
  );
}

const pluralLabel: Record<PostKind, TextKey> = {
  job: "oppPluralJob",
  partnership: "oppPluralPartnership",
  collaboration: "oppPluralCollaboration",
  investment: "oppPluralInvestment",
  tender: "oppPluralTender",
};

const DAY_MS = 86_400_000;

/** Whole days from now until a closing date (YYYY-MM-DD, Tanzania). */
const daysUntil = (date: string, now: Date) =>
  Math.floor((new Date(`${date}T23:59:59+03:00`).getTime() - now.getTime()) / DAY_MS);

function postedLine(t: Strings, publishedAt: string, now: Date, language: Language): string {
  const ms = now.getTime() - new Date(publishedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return t.oppPostedNow;
  if (hours < 24) return t.oppPostedHours(hours);
  if (hours < 48) return t.oppPostedYesterday;
  const days = Math.floor(ms / DAY_MS);
  if (days < 30) return t.oppPostedDays(days);
  return t.oppPostedOn(formatDate(new Date(publishedAt), language));
}

/** "Posted 2 hours ago · Closes 12 December", with the closing part marked when it is 3 days away or less. */
function WhenLine({ post, now, small }: { post: OpportunityCard; now: Date; small?: boolean }) {
  const { t, language } = useLanguage();
  const left = daysUntil(post.closingAt, now);
  const soon = left <= 3;
  const closes = soon ? t.oppClosesInDays(left) : t.oppCloses(closingDay(post.closingAt, language));
  return (
    <Text className={`font-figtree text-ink-2 ${small ? "text-[12px]" : "text-[13px]"}`}>
      {post.publishedAt ? `${postedLine(t, post.publishedAt, now, language)} · ` : ""}
      <Text className={soon ? "font-figtree-bold text-warn-text" : ""}>{closes}</Text>
    </Text>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function PosterMark({ name, size }: { name: string; size: number }) {
  return (
    <View
      aria-hidden
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-[10px] bg-blue-soft"
    >
      <Text className="font-figtree-extrabold text-[15px] text-info-text">{initialsOf(name)}</Text>
    </View>
  );
}

/** The post's skills; the ones the member has are ticked. */
function SkillChips({ post }: { post: OpportunityCard }) {
  const mine = new Set(post.skillsMine ?? []);
  if (post.skills.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {post.skills.map((skill) =>
        mine.has(skill) ? (
          <View key={skill} className="rounded-full bg-good-soft px-2.5 py-1">
            <Text className="font-figtree-semibold text-[13px] text-good-text">{`${skill} ✓`}</Text>
          </View>
        ) : (
          <View key={skill} className="rounded-full border border-line bg-surface-2 px-2.5 py-1">
            <Text className="font-figtree text-[13px] text-ink">{skill}</Text>
          </View>
        ),
      )}
    </View>
  );
}

function Badges({ post, withType }: { post: OpportunityCard; withType: boolean }) {
  const { t } = useLanguage();
  if (!withType && !post.featured && !post.isMine) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {withType ? <Badge text={t[typeLabel[post.type]] as string} /> : null}
      {post.featured ? <Badge tone="gold" text={t.oppFeatured} /> : null}
      {post.isMine ? <Badge text={t.oppYours} /> : null}
    </View>
  );
}

/** S16 on a computer: one post as a row of the list, with its summary and skills. */
function OpportunityRow({
  post,
  saved,
  onToggleSave,
  last,
  withType,
  now,
}: {
  post: OpportunityCard;
  saved: boolean;
  onToggleSave: () => void;
  last: boolean;
  withType: boolean;
  now: Date;
}) {
  const { t, language } = useLanguage();
  const meta = [
    post.posterName,
    placeLine(t, post, language),
    post.employmentType ? (t[employmentLabel[post.employmentType]] as string) : null,
  ].filter(Boolean);
  return (
    <View className={`flex-row gap-4 p-5 ${last ? "" : "border-b border-line"}`}>
      <LinkButton
        href={`/opportunities/${post.id}`}
        label={post.title}
        className="min-w-0 flex-1 flex-row gap-4"
      >
        <PosterMark name={post.posterName} size={48} />
        <View className="min-w-0 flex-1 gap-1.5">
          <Badges post={post} withType={withType} />
          <WhenLine post={post} now={now} />
          <Text className="font-figtree-bold text-[18px] text-ink">{post.title}</Text>
          <Text className="font-figtree text-[14px] text-ink-2">{meta.join(" · ")}</Text>
          {post.summary ? (
            <Text numberOfLines={2} className="font-figtree text-[14px] leading-[21px] text-ink">
              {post.summary}
            </Text>
          ) : null}
          <SkillChips post={post} />
        </View>
      </LinkButton>
      <SaveButton saved={saved} title={post.title} onPress={onToggleSave} />
    </View>
  );
}

/** S16 on a phone: one post as a compact card. */
function OpportunityPhoneCard({
  post,
  saved,
  onToggleSave,
  withType,
  now,
}: {
  post: OpportunityCard;
  saved: boolean;
  onToggleSave: () => void;
  withType: boolean;
  now: Date;
}) {
  const { t, language } = useLanguage();
  const fit = [
    post.skillsTotal && post.skillsMatched !== undefined
      ? t.oppSkillsMatch(post.skillsMatched, post.skillsTotal)
      : null,
    post.employmentType ? (t[employmentLabel[post.employmentType]] as string) : null,
  ].filter(Boolean);
  return (
    <View className="relative">
      <LinkButton
        href={`/opportunities/${post.id}`}
        label={post.title}
        className="gap-2 rounded-[14px] border border-line bg-surface p-4"
      >
        <View className="flex-row items-center gap-3 pr-10">
          <PosterMark name={post.posterName} size={44} />
          <View className="min-w-0 flex-1">
            <Text className="font-figtree-bold text-[16px] text-ink">{post.title}</Text>
            <Text className="font-figtree text-[13px] text-ink-2">
              {[post.posterName, placeLine(t, post, language)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        <Badges post={post} withType={withType} />
        {fit.length ? (
          <Text className="font-figtree-semibold text-[13px] text-ink">{fit.join(" · ")}</Text>
        ) : null}
        <WhenLine post={post} now={now} small />
      </LinkButton>
      <View style={{ position: "absolute", top: 8, right: 8 }}>
        <SaveButton saved={saved} title={post.title} onPress={onToggleSave} />
      </View>
    </View>
  );
}

type Choices = { value: string; label: string }[];

/** The filter fields for the phone's sheet. */
function SheetFilters({
  filters,
  onChange,
  regions,
  sectors,
}: {
  filters: OpportunityFilters;
  onChange: (next: OpportunityFilters) => void;
  regions: Choices;
  sectors: Choices;
}) {
  const { t } = useLanguage();
  const any = { value: "", label: t.anyOption };
  const set = (change: Partial<OpportunityFilters>) => onChange({ ...filters, ...change });
  return (
    <View className="gap-3">
      <Chips
        label={t.fieldType}
        options={[
          { value: "all", label: t.oppAll },
          ...KINDS.map((k) => ({ value: k, label: t[typeLabel[k]] as string })),
        ]}
        value={filters.kind ?? "all"}
        onChange={(k) =>
          set({
            kind: k === "all" ? undefined : (k as PostKind),
            employment: k === "all" || k === "job" ? filters.employment : undefined,
          })
        }
      />
      <ChoiceList
        label={t.region}
        options={[any, ...regions]}
        value={filters.region ?? ""}
        onChange={(region) => set({ region: region || undefined })}
      />
      <ChoiceList
        label={t.filterSector}
        options={[any, ...sectors]}
        value={filters.sector ?? ""}
        onChange={(sector) => set({ sector: sector || undefined })}
      />
      {filters.kind === undefined || filters.kind === "job" ? (
        <ChoiceList
          label={t.fieldEmployment}
          options={[any, ...employmentChoices(t)]}
          value={filters.employment ?? ""}
          onChange={(e) => set({ employment: (e || undefined) as EmploymentType | undefined })}
        />
      ) : null}
      <ChoiceList
        label={t.oppPosted}
        options={postedChoices(t)}
        value={filters.postedWithin ? String(filters.postedWithin) : ""}
        onChange={(d) => set({ postedWithin: d ? Number(d) : undefined })}
      />
    </View>
  );
}

const employmentChoices = (t: Strings) =>
  employmentTypes.map((e) => ({ value: e, label: t[employmentLabel[e]] as string }));

const postedChoices = (t: Strings) => [
  { value: "", label: t.oppPostedAny },
  ...POSTED_WITHIN.map((d) => ({ value: String(d), label: t.oppPostedWithin(d) })),
];

const labelOf = (options: Choices, value: string | undefined) =>
  value ? (options.find((o) => o.value === value)?.label ?? null) : null;

/** The computer's filter row: Type, Region, Sector, Employment (jobs only), Posted and Clear all. */
function FilterRow({
  filters,
  apply,
  regions,
  sectors,
}: {
  filters: OpportunityFilters;
  apply: (next: OpportunityFilters) => void;
  regions: Choices;
  sectors: Choices;
}) {
  const { t } = useLanguage();
  const [menu, setMenu] = useState<string | null>(null);
  const toggle = (key: string) => setMenu((m) => (m === key ? null : key));
  const set = (change: Partial<OpportunityFilters>) => {
    setMenu(null);
    apply({ ...filters, ...change });
  };
  const any = { value: "", label: t.anyOption };
  const kinds = KINDS.map((k) => ({ value: k, label: t[typeLabel[k]] as string }));
  const on = [
    filters.kind,
    filters.region,
    filters.sector,
    filters.employment,
    filters.postedWithin,
  ].some((v) => v !== undefined);
  return (
    <FilterBar>
      <FilterMenu
        label={t.fieldType}
        value={labelOf(kinds, filters.kind)}
        open={menu === "kind"}
        onToggle={() => toggle("kind")}
      >
        <FilterOptions
          options={[{ value: "", label: t.oppAll }, ...kinds]}
          value={filters.kind ?? ""}
          onChange={(k) =>
            set({
              kind: (k || undefined) as PostKind | undefined,
              employment: !k || k === "job" ? filters.employment : undefined,
            })
          }
        />
      </FilterMenu>
      <FilterMenu
        label={t.region}
        value={labelOf(regions, filters.region)}
        open={menu === "region"}
        onToggle={() => toggle("region")}
      >
        <FilterOptions
          options={[any, ...regions]}
          value={filters.region ?? ""}
          onChange={(region) => set({ region: region || undefined })}
        />
      </FilterMenu>
      <FilterMenu
        label={t.filterSector}
        value={labelOf(sectors, filters.sector)}
        open={menu === "sector"}
        onToggle={() => toggle("sector")}
      >
        <FilterOptions
          options={[any, ...sectors]}
          value={filters.sector ?? ""}
          onChange={(sector) => set({ sector: sector || undefined })}
        />
      </FilterMenu>
      {filters.kind === undefined || filters.kind === "job" ? (
        <FilterMenu
          label={t.fieldEmployment}
          value={labelOf(employmentChoices(t), filters.employment)}
          open={menu === "employment"}
          onToggle={() => toggle("employment")}
        >
          <FilterOptions
            options={[any, ...employmentChoices(t)]}
            value={filters.employment ?? ""}
            onChange={(e) => set({ employment: (e || undefined) as EmploymentType | undefined })}
          />
        </FilterMenu>
      ) : null}
      <FilterMenu
        label={t.oppPosted}
        value={labelOf(postedChoices(t).slice(1), filters.postedWithin?.toString())}
        open={menu === "posted"}
        onToggle={() => toggle("posted")}
      >
        <FilterOptions
          options={postedChoices(t)}
          value={filters.postedWithin ? String(filters.postedWithin) : ""}
          onChange={(d) => set({ postedWithin: d ? Number(d) : undefined })}
        />
      </FilterMenu>
      {on ? (
        <ClearAll
          onPress={() => {
            setMenu(null);
            apply({});
          }}
        />
      ) : null}
    </FilterBar>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-2xl border border-line bg-surface p-5">
      <Text role="heading" aria-level={2} className="font-figtree-extrabold text-[16px] text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

const yourLinks: { key: TextKey; href: string }[] = [
  { key: "myPostsTitle", href: "/opportunities/mine" },
  { key: "respMineTitle", href: "/opportunities/responses" },
  { key: "scanTitle", href: "/opportunities/scan" },
];

function YourLinks({ row }: { row?: boolean }) {
  const { t } = useLanguage();
  return (
    <View className={row ? "flex-row flex-wrap gap-2" : ""}>
      {yourLinks.map((item, i) => (
        <LinkButton
          key={item.href}
          href={item.href}
          label={t[item.key] as string}
          className={
            row
              ? "min-h-[44px] items-center justify-center rounded-[10px] border border-line bg-surface px-4"
              : `min-h-[44px] flex-row items-center justify-between ${i > 0 ? "border-t border-line" : ""}`
          }
        >
          <Text className="font-figtree-semibold text-[14px] text-ink">
            {t[item.key] as string}
          </Text>
          {row ? null : (
            <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
              ›
            </Text>
          )}
        </LinkButton>
      ))}
    </View>
  );
}

function AddSkillsLink() {
  const { t } = useLanguage();
  return (
    <LinkButton href="/profile/edit" label={t.oppAddSkills} className="min-h-[40px] justify-center">
      <Text className="font-figtree-bold text-sm text-blue">{t.oppAddSkills}</Text>
    </LinkButton>
  );
}

/** S16: published open posts, featured first, 20 at a time, with search and filters (O02). */
export function OpportunitiesList({
  api,
  alerts,
  canPost,
  now = new Date(),
}: {
  api: OpportunityBrowseApi;
  alerts?: JobAlertsApi;
  /** O14: whether this member may post (Level 3, posting not paused). The server checks again. */
  canPost?: () => Promise<boolean>;
  now?: Date;
}) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const saved = useSavedPosts(api);
  const poster = useLoad(() => canPost?.().catch(() => false) ?? Promise.resolve(false), 0);
  const sectorsLoad = useLoad(() => api.sectors(language).catch(() => []), 0);
  const regionsLoad = useLoad(() => api.regions(language).catch(() => []), 0);
  const sorted = (loaded: typeof sectorsLoad) =>
    loaded.state === "ready"
      ? [...loaded.value].sort((a, b) => a.label.localeCompare(b.label))
      : [];
  const regions = sorted(regionsLoad);
  const sectors = sorted(sectorsLoad);
  const [filters, setFilters] = useState<OpportunityFilters>({});
  const [draft, setDraft] = useState<OpportunityFilters>({});
  const [typed, setTyped] = useState("");
  const phone = usePhone();
  const [run, setRun] = useState(0);
  const skillCount = useLoad(() => api.mySkillCount().catch(() => 0), 0);
  const [chosen, setChosen] = useState<"best" | "newest" | null>(null);
  const ready = skillCount.state !== "loading";
  const hasSkills = skillCount.state === "ready" && skillCount.value > 0;
  const best = (chosen ?? (hasSkills ? "best" : "newest")) === "best";
  const first = useLoad(
    () => (ready ? api.list(filters, 0, best) : new Promise<OpportunityCard[]>(() => undefined)),
    run * 4 + (ready ? 2 : 0) + (best ? 1 : 0),
  );
  const [more, setMore] = useState<OpportunityCard[]>([]);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const reset = () => {
    setMore([]);
    setPage(1);
    setDone(false);
    setMoreFailed(false);
    setRun((r) => r + 1);
  };

  const apply = (next: OpportunityFilters) => {
    const withWords = { ...next, q: typed.trim() || undefined };
    setFilters(withWords);
    setDraft(withWords);
    reset();
  };

  const search = (q: string) => {
    const next = { ...filters, q: q.trim() || undefined };
    setFilters(next);
    setDraft(next);
    reset();
  };

  const loadMore = async () => {
    setBusy(true);
    setMoreFailed(false);
    try {
      const next = await api.list(filters, page, best);
      setMore((m) => [...m, ...next]);
      setPage((p) => p + 1);
      if (next.length < OPPORTUNITY_PAGE) setDone(true);
    } catch {
      setMoreFailed(true);
    }
    setBusy(false);
  };

  const filterCount = [
    filters.kind,
    filters.region,
    filters.sector,
    filters.employment,
    filters.postedWithin,
  ].filter((v) => v !== undefined).length;
  const filtered = filterCount > 0 || Boolean(filters.q);
  const noSkills = skillCount.state === "ready" && !hasSkills;
  const kinds = filters.kind ? (t[pluralLabel[filters.kind]] as string) : null;
  const regionName = labelOf(regions, filters.region);
  const withType = filters.kind === undefined;

  const postButton =
    poster.state === "ready" && poster.value ? (
      phone ? (
        <LinkButton
          href="/opportunities/new"
          label={t.actionPostOpportunity}
          className="h-11 w-11 items-center justify-center rounded-full bg-blue"
        >
          <Plus size={22} color={palette.blueInk} aria-hidden />
        </LinkButton>
      ) : (
        <LinkButton
          href="/opportunities/new"
          label={t.actionPostOpportunity}
          className="min-h-[44px] items-center justify-center rounded-[10px] bg-blue px-[18px]"
        >
          <Text className="font-figtree-bold text-[15px] text-blue-ink">
            {t.actionPostOpportunity}
          </Text>
        </LinkButton>
      )
    ) : null;

  const tabs = (
    <View className="flex-row items-end gap-5 border-b border-line">
      <View role="tablist" aria-label={t.oppSortBy} className="flex-row gap-5">
        {(["best", "newest"] as const).map((tab) => {
          const on = (tab === "best") === best;
          return (
            <Pressable
              key={tab}
              role="tab"
              aria-selected={on}
              onPress={() => {
                setChosen(tab);
                reset();
              }}
              className={`min-h-[44px] justify-center border-b-[3px] px-0.5 ${on ? "border-navy" : "border-transparent"}`}
            >
              <Text
                className={`text-[15px] ${on ? "font-figtree-bold text-ink" : "font-figtree-medium text-ink-2"}`}
              >
                {tab === "best" ? t.oppBestMatches : t.oppNewest}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <LinkButton
        href="/opportunities/saved"
        label={t.savedCount(saved.count)}
        className="min-h-[44px] justify-center border-b-[3px] border-transparent px-0.5"
      >
        <Text className="font-figtree-medium text-[15px] text-ink-2">
          {t.savedCount(saved.count)}
        </Text>
      </LinkButton>
    </View>
  );

  const searchBox = (
    <SearchBox
      label={t.oppSearchLabel}
      hint={phone ? t.searchButton : t.oppSearchHint}
      value={typed}
      onChange={setTyped}
      onSearch={search}
      round={phone}
    />
  );

  const posts = first.state === "ready" ? [...first.value, ...more] : [];
  const list =
    first.state === "failed" ? (
      <ErrorState message={t.oppLoadFailed} onRetry={() => setRun((r) => r + 1)} />
    ) : first.state === "loading" ? (
      <LoadingRows />
    ) : posts.length === 0 ? (
      filtered ? (
        <EmptyState title={t.oppNoMatchTitle} message={t.oppNoMatchMessage} />
      ) : (
        <EmptyState title={t.oppEmptyTitle} message={t.oppEmptyMessage} />
      )
    ) : (
      <>
        {phone ? (
          <View className="gap-3">
            {posts.map((post) => (
              <OpportunityPhoneCard
                key={post.id}
                post={post}
                saved={saved.isSaved(post.id)}
                onToggleSave={() => saved.toggle(post.id)}
                withType={withType}
                now={now}
              />
            ))}
          </View>
        ) : (
          <View className="overflow-hidden rounded-[14px] border border-line bg-surface">
            {posts.map((post, i) => (
              <OpportunityRow
                key={post.id}
                post={post}
                saved={saved.isSaved(post.id)}
                onToggleSave={() => saved.toggle(post.id)}
                last={i === posts.length - 1}
                withType={withType}
                now={now}
              />
            ))}
          </View>
        )}
        {moreFailed ? (
          <ErrorState message={t.oppLoadFailed} onRetry={loadMore} />
        ) : !done && first.state === "ready" && first.value.length === OPPORTUNITY_PAGE ? (
          <Button secondary label={t.loadMore} disabled={busy} onPress={loadMore} />
        ) : null}
      </>
    );

  const listLine = (
    <Text className="font-figtree text-sm text-ink-2">
      {t.oppListLine(kinds, regionName, best)}
    </Text>
  );

  if (phone)
    return (
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-2">
          <ScreenTitle>{t.navOpportunities}</ScreenTitle>
          {postButton}
        </View>
        <View className="flex-row items-center gap-2">
          {searchBox}
          <FilterSheet
            count={filterCount}
            onApply={() => apply(draft)}
            onClear={() => {
              setDraft({});
              apply({});
            }}
          >
            <SheetFilters filters={draft} onChange={setDraft} regions={regions} sectors={sectors} />
          </FilterSheet>
        </View>
        {tabs}
        {noSkills ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2 rounded-card bg-blue-soft px-4 py-3">
            <Text className="flex-1 font-figtree text-sm text-ink">{t.oppAddSkillsForMatches}</Text>
            <AddSkillsLink />
          </View>
        ) : null}
        {listLine}
        {list}
        {alerts ? <AlertSwitch api={alerts} filters={filters} /> : null}
        <YourLinks row />
        <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.oppNoFeeNote}</Text>
      </View>
    );

  return (
    <View className="flex-row flex-wrap items-start gap-6">
      <View className="min-w-0 flex-1 basis-[600px] gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <ScreenTitle>{t.navOpportunities}</ScreenTitle>
          {postButton}
        </View>
        <View className="flex-row">{searchBox}</View>
        {tabs}
        <FilterRow filters={filters} apply={apply} regions={regions} sectors={sectors} />
        {listLine}
        {list}
      </View>
      <View className="w-[300px] gap-4">
        {noSkills ? (
          <SideCard title={t.oppBetterMatches}>
            <Text className="font-figtree text-sm leading-5 text-ink-2">
              {t.oppAddSkillsForMatches}
            </Text>
            <AddSkillsLink />
          </SideCard>
        ) : null}
        {alerts ? (
          <SideCard title={t.oppAlertTitle}>
            <AlertSwitch api={alerts} filters={filters} />
          </SideCard>
        ) : null}
        <SideCard title={t.oppYourSide}>
          <YourLinks />
        </SideCard>
        <View className="gap-2 rounded-2xl border border-line bg-surface-2 p-5">
          <Text
            role="heading"
            aria-level={2}
            className="font-figtree-extrabold text-[15px] text-ink"
          >
            {t.oppStaySafe}
          </Text>
          <Text className="font-figtree text-sm leading-5 text-ink-2">{t.oppNoFeeNote}</Text>
        </View>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="gap-0.5">
      <Text className="font-figtree text-[13px] text-ink-2">{label}</Text>
      <Text className="font-figtree-semibold text-[15px] text-ink">{value}</Text>
    </View>
  );
}

const shillings = (n: number) => `TZS ${n.toLocaleString("en-US")}`;

function TenderSection({
  api,
  tender,
  closingAt,
}: {
  api: OpportunityBrowseApi;
  tender: TenderDetails;
  closingAt: string;
}) {
  const { t, language } = useLanguage();
  const [linkFailed, setLinkFailed] = useState(false);
  const open = async () => {
    const link = tender.documentPath ? await api.documentLink(tender.documentPath) : null;
    if (!link) return setLinkFailed(true);
    setLinkFailed(false);
    await Linking.openURL(link);
  };
  const closes = tender.closingTime
    ? t.oppTenderClosesAt(closingDay(closingAt, language), tender.closingTime.slice(0, 5))
    : closingDay(closingAt, language);
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
        {t.oppTenderTitle}
      </Text>
      <Fact label={t.oppTenderIssuer} value={tender.issuingOrg} />
      <Fact label={t.oppTenderReference} value={tender.referenceNo} />
      <Fact label={t.oppTenderScope} value={tender.scope} />
      <Fact label={t.oppTenderEligibility} value={tender.eligibility} />
      {tender.requiredDocuments.length ? (
        <View className="gap-0.5">
          <Text className="font-figtree text-[13px] text-ink-2">{t.oppTenderDocuments}</Text>
          {tender.requiredDocuments.map((d) => (
            <Text key={d} className="font-figtree text-[15px] text-ink">
              {`• ${d}`}
            </Text>
          ))}
        </View>
      ) : null}
      <Fact label={t.oppTenderCloses} value={closes} />
      <Fact
        label={t.oppTenderValue}
        value={tender.estimatedValue !== null ? shillings(tender.estimatedValue) : null}
      />
      {tender.documentPath ? (
        <Pressable
          role="link"
          aria-label={t.oppTenderDocument}
          onPress={open}
          className="min-h-[44px] justify-center"
        >
          <Text className="font-figtree-semibold text-sm text-blue">{t.oppTenderDocument}</Text>
        </Pressable>
      ) : null}
      <Message text={linkFailed ? t.oppTenderDocumentFailed : null} />
    </View>
  );
}

/** S17: one post. Closed and expired posts are read-only; hidden or reported ones come back empty (O02). */
export function OpportunityDetailScreen({
  api,
  id,
  respond,
  mySkills,
}: {
  api: OpportunityBrowseApi;
  id: string;
  respond?: (post: OpportunityDetail) => React.ReactNode;
  mySkills?: MySkillsApi;
}) {
  const { t, language } = useLanguage();
  const phone = usePhone();
  const saved = useSavedPosts(api);
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const post = await api.detail(id);
    const tender = post?.type === "tender" ? await api.tender(id) : null;
    return { post, tender };
  }, attempt);

  if (loaded.state === "failed")
    return <ErrorState message={t.oppLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  if (loaded.state === "loading") return <LoadingRows />;
  const { post, tender } = loaded.value;
  if (!post)
    return (
      <EmptyState
        title={t.oppNotFoundTitle}
        message={t.oppNotFoundMessage}
        action={{ label: t.oppBack, href: "/opportunities" }}
      />
    );

  const role = roleLine(t, post);
  const action = !post.isMine && !post.readOnly && respond ? respond(post) : null;
  const save = (
    <SaveButton
      withWords
      saved={saved.isSaved(post.id)}
      title={post.title}
      onPress={() => saved.toggle(post.id)}
    />
  );
  const yourSkills =
    mySkills && !post.isMine && post.skills.length > 0 ? (
      <YourSkillsForPost skills={post.skills} api={mySkills} />
    ) : null;

  if (!phone)
    return (
      <View className="gap-4">
        <LinkButton
          href="/opportunities"
          label={t.oppBack}
          className="min-h-[40px] justify-center self-start"
        >
          <Text className="font-figtree-semibold text-sm text-blue">{t.oppBack}</Text>
        </LinkButton>
        <View className="flex-row items-start gap-6">
          <View className="min-w-0 flex-1 gap-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge text={t[typeLabel[post.type]] as string} />
              {post.featured ? <Badge tone="gold" text={t.oppFeatured} /> : null}
            </View>
            <ScreenTitle>{post.title}</ScreenTitle>
            <Text className="font-figtree-semibold text-[14px] text-ink-2">{post.posterName}</Text>
            {post.readOnly ? <Message tone="info" text={t.oppReadOnly} /> : null}
            <Text className="font-figtree text-[15px] leading-6 text-ink">{post.description}</Text>
            <View className="gap-3 rounded-card border border-line bg-surface p-4">
              <Fact label={t.oppRoleLabel} value={role} />
              <Fact label={t.oppPlaceLabel} value={placeLine(t, post, language)} />
              <Fact label={t.filterSector} value={named(post.sector, language)} />
              <Fact label={t.fieldSkills} value={post.skills.join(", ") || null} />
            </View>
            {tender ? <TenderSection api={api} tender={tender} closingAt={post.closingAt} /> : null}
          </View>
          <View className="w-[320px] gap-4">
            <View className="gap-3 rounded-card border border-line bg-surface p-4">
              <Fact label={t.fieldClosing} value={closingDay(post.closingAt, language)} />
              {post.isMine ? (
                <LinkButton
                  href="/opportunities/mine"
                  label={t.oppYourPost}
                  className="min-h-[40px] justify-center"
                >
                  <Text className="font-figtree-semibold text-sm text-blue">{t.oppYourPost}</Text>
                </LinkButton>
              ) : (
                save
              )}
            </View>
            {action}
            <View className="gap-2">
              <Text className="font-figtree text-[13px] leading-5 text-ink-2">
                {t.oppNoFeeNote}
              </Text>
              {post.isMine ? null : (
                <View className="items-start">
                  <ReportLink
                    target={{ type: "opportunity", id: post.id }}
                    memberId={post.posterId ?? ""}
                  />
                </View>
              )}
            </View>
            {yourSkills}
          </View>
        </View>
      </View>
    );

  return (
    <View className="gap-4">
      <LinkButton href="/opportunities" label={t.oppBack} className="min-h-[40px] justify-center">
        <Text className="font-figtree-semibold text-sm text-blue">{t.oppBack}</Text>
      </LinkButton>
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge text={t[typeLabel[post.type]] as string} />
        {post.featured ? <Badge tone="gold" text={t.oppFeatured} /> : null}
        {post.isMine ? null : <View className="ml-auto">{save}</View>}
      </View>
      <ScreenTitle>{post.title}</ScreenTitle>
      <Text className="font-figtree-semibold text-[14px] text-ink-2">{post.posterName}</Text>
      {post.readOnly ? <Message tone="info" text={t.oppReadOnly} /> : null}
      <Text className="font-figtree text-[15px] leading-6 text-ink">{post.description}</Text>
      <View className="gap-3 rounded-card border border-line bg-surface p-4">
        <Fact label={t.oppRoleLabel} value={role} />
        <Fact label={t.oppPlaceLabel} value={placeLine(t, post, language)} />
        <Fact label={t.filterSector} value={named(post.sector, language)} />
        <Fact label={t.fieldSkills} value={post.skills.join(", ") || null} />
        <Fact label={t.fieldClosing} value={closingDay(post.closingAt, language)} />
      </View>
      {yourSkills}
      {tender ? <TenderSection api={api} tender={tender} closingAt={post.closingAt} /> : null}
      {post.isMine ? (
        <LinkButton
          href="/opportunities/mine"
          label={t.oppYourPost}
          className="min-h-[40px] justify-center"
        >
          <Text className="font-figtree-semibold text-sm text-blue">{t.oppYourPost}</Text>
        </LinkButton>
      ) : (
        <View className="items-start">
          <ReportLink
            target={{ type: "opportunity", id: post.id }}
            memberId={post.posterId ?? ""}
          />
        </View>
      )}
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.oppNoFeeNote}</Text>
      {action ? (
        <View
          style={stickToBottom}
          className="-mx-5 -mb-4 border-t border-line bg-surface px-5 pb-4 pt-3"
        >
          {action}
        </View>
      ) : null}
    </View>
  );
}

/** O10: the member's saved posts. A closed post says so; one that is gone can only be removed. */
export function SavedOpportunities({ api }: { api: OpportunityBrowseApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.saved(), attempt);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const remove = async (id: string) => {
    if (await api.setSaved(id, false).catch(() => false)) setRemoved((r) => new Set(r).add(id));
  };

  return (
    <View className="gap-3">
      <LinkButton href="/opportunities" label={t.oppBack} className="min-h-[40px] justify-center">
        <Text className="font-figtree-semibold text-sm text-blue">{t.oppBack}</Text>
      </LinkButton>
      <ScreenTitle>{t.savedTitle}</ScreenTitle>
      {loaded.state === "failed" ? (
        <ErrorState message={t.savedLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.filter((s) => !removed.has(s.id)).length === 0 ? (
        <EmptyState
          title={t.savedEmpty}
          message={t.savedEmptyHint}
          action={{ label: t.navOpportunities, href: "/opportunities" }}
        />
      ) : (
        loaded.value
          .filter((s) => !removed.has(s.id))
          .map((s) =>
            s.card ? (
              <View key={s.id} className="gap-1">
                {s.open ? null : <Badge text={t.savedClosed} />}
                <OpportunityCardView post={s.card} saved onToggleSave={() => remove(s.id)} />
              </View>
            ) : (
              <View
                key={s.id}
                className="flex-row flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
              >
                <Text className="font-figtree text-[14px] text-ink-2">{t.savedGone}</Text>
                <Button secondary label={t.savedRemove} onPress={() => remove(s.id)} />
              </View>
            ),
          )
      )}
    </View>
  );
}

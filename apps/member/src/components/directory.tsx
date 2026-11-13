import type { Language, Strings, TextKey } from "@kingdom-connect/shared";
import { Children, useEffect, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import {
  noBusinessFilters,
  noFilters,
  type BusinessCard,
  type BusinessFilters,
  type BusinessLevel,
  type DirectoryApi,
  type DirectoryCard,
  type DirectoryFilters,
  type ResultPage,
} from "../lib/directory";
import { useLanguage } from "../lib/language";
import type { Option } from "../lib/registration";
import { Button, ChoiceList, Field } from "./form";
import { FilterSheet, usePhone } from "./filter-sheet";
import { LinkButton } from "./link-button";
import { Avatar } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

export function DirectoryCardView({ card, fill }: { card: DirectoryCard; fill?: boolean }) {
  const { t } = useLanguage();
  return (
    <View
      className={`${fill ? "flex-1 " : ""}gap-3 rounded-card border border-line bg-surface p-4`}
    >
      <LinkButton
        href={`/profile/${card.memberId}`}
        label={[card.fullName, card.headline].filter(Boolean).join(", ")}
        className="flex-row items-center gap-3"
      >
        <Avatar name={card.fullName} url={card.photoUrl} size={52} />
        <View className="flex-1 gap-0.5">
          <Text className="font-figtree-bold text-base text-ink">{card.fullName}</Text>
          {card.headline ? (
            <Text className="font-figtree text-sm text-ink">{card.headline}</Text>
          ) : null}
          {card.location ? (
            <Text className="font-figtree text-[13px] text-ink-2">{card.location}</Text>
          ) : null}
        </View>
      </LinkButton>
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="rounded-full bg-good-soft px-2.5 py-1">
          <Text className="font-figtree-semibold text-xs text-good-text">
            {card.business ? t.badgeBusiness : t.badgeMember}
          </Text>
        </View>
        {card.topSkills.map((skill) => (
          <View key={skill} className="rounded-full bg-blue-soft px-2.5 py-1">
            <Text className="font-figtree-semibold text-xs text-info-text">{skill}</Text>
          </View>
        ))}
      </View>
      <View className="mt-auto flex-row flex-wrap items-center gap-3">
        {card.relation === "none" || card.relation === "received" ? (
          <LinkButton
            href={card.relation === "none" ? `/profile/${card.memberId}?connect=1` : "/connections"}
            label={card.relation === "none" ? t.connect : t.respondInConnections}
            className="min-h-[40px] justify-center rounded-[9px] bg-blue px-4"
          >
            <Text className="font-figtree-bold text-sm text-blue-ink">
              {card.relation === "none" ? t.connect : t.respondInConnections}
            </Text>
          </LinkButton>
        ) : (
          <Text className="font-figtree-semibold text-[13px] text-ink-2">
            {card.relation === "sent" ? t.requestSent : t.connected}
          </Text>
        )}
      </View>
    </View>
  );
}

const sizeLabel: Record<BusinessCard["size"], TextKey> = {
  micro: "sizeMicro",
  small: "sizeSmall",
  medium: "sizeMedium",
  large: "sizeLarge",
};

function BusinessCardView({ card, fill }: { card: BusinessCard; fill?: boolean }) {
  const { t } = useLanguage();
  return (
    <View
      className={`${fill ? "flex-1 " : ""}gap-3 rounded-card border border-line bg-surface p-4`}
    >
      <LinkButton
        href={`/profile/${card.memberId}`}
        label={[card.name, card.ownerName].filter(Boolean).join(", ")}
        className="flex-row items-center gap-3"
      >
        <Avatar name={card.name} url={null} size={52} />
        <View className="flex-1 gap-0.5">
          <Text className="font-figtree-bold text-base text-ink">{card.name}</Text>
          <Text className="font-figtree text-[13px] text-ink-2">
            {[card.sector, t[sizeLabel[card.size]] as string].join(" · ")}
          </Text>
          {card.location ? (
            <Text className="font-figtree text-[13px] text-ink-2">{card.location}</Text>
          ) : null}
        </View>
      </LinkButton>
      {card.description ? (
        <Text className="font-figtree text-sm text-ink">{card.description}</Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="rounded-full bg-good-soft px-2.5 py-1">
          <Text className="font-figtree-semibold text-xs text-good-text">
            {card.level === 3 ? t.optionPoster : t.badgeBusiness}
          </Text>
        </View>
        {card.ownerName ? (
          <Text className="font-figtree text-[13px] text-ink-2">{t.ownedBy(card.ownerName)}</Text>
        ) : null}
      </View>
    </View>
  );
}

type Results<C> = ResultPage<C> & { page: number };

/** The applied filters, the loaded pages and Load more, shared by both tabs. */
function useSearch<F, C>(
  search: (filters: F, page: number, language: Language) => Promise<ResultPage<C>>,
  initial: F,
  keyOf: (card: C) => string,
) {
  const { language } = useLanguage();
  const [applied, setApplied] = useState<F>(initial);
  const [results, setResults] = useState<Results<C> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    search(applied, 0, language).then(
      (page) => live && setResults({ ...page, page: 0 }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [search, applied, language, attempt]);

  const run = (filters: F) => {
    setFailed(false);
    setResults(null);
    setApplied(filters);
    setAttempt((a) => a + 1);
  };

  const loadMore = async () => {
    if (!results) return;
    const next = results.page + 1;
    const page = await search(applied, next, language).catch(() => null);
    if (!page) return setFailed(true);
    const seen = new Set(results.cards.map(keyOf));
    const fresh = page.cards.filter((c) => !seen.has(keyOf(c)));
    setResults({ cards: [...results.cards, ...fresh], more: page.more, page: next });
  };

  return { applied, results, failed, run, loadMore };
}

function SearchActions({ onSearch, onClear }: { onSearch: () => void; onClear: () => void }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row flex-wrap gap-2">
      <View className="min-w-[140px] flex-1">
        <Button label={t.searchButton} onPress={onSearch} />
      </View>
      <View className="min-w-[140px] flex-1">
        <Button secondary label={t.clearFilters} onPress={onClear} />
      </View>
    </View>
  );
}

/** How many of the directory's filters are on; the search words are not a filter. */
function activeFilters(f: DirectoryFilters): number {
  return [f.profession, f.skill, f.sector, f.region, f.district, f.studying].filter(
    (v) => v !== null && v !== "",
  ).length;
}

/**
 * The filters under the search box. On a computer they stay open with Search and Clear; on a phone they fold
 * into one Filters button so the results show first, and Search stays beside it.
 */
function FilterArea({
  count,
  onSearch,
  onClear,
  children,
}: {
  count: number;
  onSearch: () => void;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  if (usePhone())
    return (
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="min-w-[120px] flex-1">
          <Button label={t.searchButton} onPress={onSearch} />
        </View>
        <FilterSheet count={count} onApply={onSearch} onClear={onClear}>
          {children}
        </FilterSheet>
      </View>
    );
  return (
    <>
      <Text role="heading" aria-level={2} className="font-figtree-bold text-sm text-ink">
        {t.filtersTitle}
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {Children.toArray(children).map((child, i) => (
          <View key={i} className="min-w-[200px] flex-1">
            {child}
          </View>
        ))}
      </View>
      <SearchActions onSearch={onSearch} onClear={onClear} />
    </>
  );
}

const WIDE = 1280;

/** One column on a phone, two on a computer, three on a wide screen. */
function useColumns(): number {
  const phone = usePhone();
  const { width } = useWindowDimensions();
  if (phone) return 1;
  return width >= WIDE ? 3 : 2;
}

function ResultList<C>({
  failed,
  results,
  emptyTitle,
  onRetry,
  onMore,
  render,
  sections,
}: {
  failed: boolean;
  results: Results<C> | null;
  emptyTitle: string;
  onRetry: () => void;
  onMore: () => void;
  render: (card: C, fill: boolean) => React.ReactNode;
  sections?: (cards: C[]) => Section<C>[];
}) {
  const { t } = useLanguage();
  const columns = useColumns();
  if (failed) return <ErrorState message={t.directoryLoadFailed} onRetry={onRetry} />;
  if (!results) return <LoadingRows />;
  if (results.cards.length === 0)
    return <EmptyState title={emptyTitle} message={t.noResultsMessage} />;
  const grid = (cards: C[]) => {
    if (columns === 1) return cards.map((card) => render(card, false));
    const rows: C[][] = [];
    for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
    return rows.map((row, r) => (
      <View key={r} className="flex-row items-stretch gap-3">
        {Array.from({ length: columns }, (_, i) => (
          <View key={i} className="min-w-0 flex-1">
            {row[i] === undefined ? null : render(row[i], true)}
          </View>
        ))}
      </View>
    ));
  };
  const parts = sections ? sections(results.cards) : [{ title: null, cards: results.cards }];
  return (
    <View className="gap-3">
      {parts.map((part, i) => (
        <View key={i} className="gap-3">
          {part.title ? (
            <Text role="heading" aria-level={2} className="font-figtree-bold text-base text-ink">
              {part.title}
            </Text>
          ) : null}
          {grid(part.cards)}
        </View>
      ))}
      {results.more ? <Button secondary label={t.loadMore} onPress={onMore} /> : null}
    </View>
  );
}

type Section<C> = { title: string | null; cards: C[] };

/** R25: with no search words, the members in the reader's region under "Near you", then the rest. */
function nearSections(t: Strings, cards: DirectoryCard[]): Section<DirectoryCard>[] {
  const near = cards.filter((c) => c.near);
  if (near.length === 0) return [{ title: null, cards }];
  const rest = cards.filter((c) => !c.near);
  return [
    { title: t.nearYouIn(near[0].near as string), cards: near },
    ...(rest.length ? [{ title: t.moreMembers, cards: rest }] : []),
  ];
}

const levelChoice: Record<string, BusinessLevel | null> = { "": null, "2": 2, "3": 3 };

function BusinessesPanel({ api }: { api: DirectoryApi }) {
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState<BusinessFilters>(noBusinessFilters);
  const [regions, setRegions] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const { applied, results, failed, run, loadMore } = useSearch(
    api.searchBusinesses,
    noBusinessFilters,
    (c: BusinessCard) => c.businessId,
  );

  useEffect(() => {
    api.regions(language).then(setRegions);
    api.sectors(language).then(setSectors);
  }, [api, language]);

  const update = (next: Partial<BusinessFilters>) => setDraft((d) => ({ ...d, ...next }));
  const choices = (options: Option[]) => [{ value: "", label: t.anyOption }, ...options];

  return (
    <>
      <View className="gap-3 rounded-card border border-line bg-surface p-4">
        <Field label={t.businessSearch} value={draft.q} onChange={(q) => update({ q })} />
        <FilterArea
          count={[applied.sector, applied.level, applied.region].filter((v) => v !== null).length}
          onSearch={() => run(draft)}
          onClear={() => {
            const next = { ...noBusinessFilters, q: draft.q };
            setDraft(next);
            run(next);
          }}
        >
          <ChoiceList
            label={t.filterSector}
            options={choices(sectors)}
            value={draft.sector ?? ""}
            onChange={(sector) => update({ sector: sector || null })}
          />
          <ChoiceList
            label={t.filterLevel}
            options={choices([
              { value: "2", label: t.badgeBusiness },
              { value: "3", label: t.optionPoster },
            ])}
            value={draft.level === null ? "" : String(draft.level)}
            onChange={(v) => update({ level: levelChoice[v] ?? null })}
          />
          <ChoiceList
            label={t.region}
            options={choices(regions)}
            value={draft.region ?? ""}
            onChange={(region) => update({ region: region || null })}
          />
        </FilterArea>
      </View>
      <ResultList
        failed={failed}
        results={results}
        emptyTitle={t.noBusinessesTitle}
        onRetry={() => run(applied)}
        onMore={loadMore}
        render={(card, fill) => <BusinessCardView key={card.businessId} card={card} fill={fill} />}
      />
    </>
  );
}

function ProfessionalsPanel({
  api,
  initialQuery = "",
}: {
  api: DirectoryApi;
  initialQuery?: string;
}) {
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState<DirectoryFilters>({ ...noFilters, q: initialQuery });
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const { applied, results, failed, run, loadMore } = useSearch(
    api.search,
    { ...noFilters, q: initialQuery },
    (c: DirectoryCard) => c.memberId,
  );

  useEffect(() => {
    api.regions(language).then(setRegions);
    api.sectors(language).then(setSectors);
  }, [api, language]);
  useEffect(() => {
    if (draft.region) api.districts(draft.region, language).then(setDistricts);
  }, [api, language, draft.region]);

  const update = (next: Partial<DirectoryFilters>) => setDraft((d) => ({ ...d, ...next }));
  const choices = (options: Option[]) => [{ value: "", label: t.anyOption }, ...options];

  return (
    <>
      <View className="gap-3 rounded-card border border-line bg-surface p-4">
        <Field label={t.directorySearch} value={draft.q} onChange={(q) => update({ q })} />
        <FilterArea
          count={activeFilters(applied)}
          onSearch={() => run(draft)}
          onClear={() => {
            const next = { ...noFilters, q: draft.q };
            setDraft(next);
            run(next);
          }}
        >
          <Field
            label={t.filterProfession}
            value={draft.profession}
            onChange={(profession) => update({ profession })}
          />
          <Field
            label={t.filterSkill}
            value={draft.skill}
            onChange={(skill) => update({ skill })}
          />
          <ChoiceList
            label={t.filterSector}
            options={choices(sectors)}
            value={draft.sector ?? ""}
            onChange={(sector) => update({ sector: sector || null })}
          />
          <ChoiceList
            label={t.region}
            options={choices(regions)}
            value={draft.region ?? ""}
            onChange={(region) => update({ region: region || null, district: null })}
          />
          <ChoiceList
            label={t.district}
            options={choices(districts)}
            value={draft.district ?? ""}
            onChange={(district) => update({ district: district || null })}
            disabled={!draft.region}
          />
          <ChoiceList
            label={t.filterStudying}
            options={[
              { value: "", label: t.anyOption },
              { value: "yes", label: t.yes },
              { value: "no", label: t.no },
            ]}
            value={draft.studying === null ? "" : draft.studying ? "yes" : "no"}
            onChange={(v) => update({ studying: v === "" ? null : v === "yes" })}
          />
        </FilterArea>
      </View>
      <ResultList
        failed={failed}
        results={results}
        emptyTitle={t.noResultsTitle}
        onRetry={() => run(applied)}
        onMore={loadMore}
        render={(card, fill) => <DirectoryCardView key={card.memberId} card={card} fill={fill} />}
        sections={applied.q.trim() ? undefined : (cards) => nearSections(t, cards)}
      />
    </>
  );
}

type Tab = "professionals" | "businesses";

function Tabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useLanguage();
  const tabs: { key: Tab; label: string }[] = [
    { key: "professionals", label: t.tabProfessionals },
    { key: "businesses", label: t.tabBusinesses },
  ];
  return (
    <View role="tablist" className="flex-row flex-wrap gap-2">
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onPress={() => onChange(tab.key)}
            className={`min-h-[44px] justify-center rounded-full px-[18px] ${
              selected ? "bg-navy" : "border border-line bg-surface"
            }`}
          >
            <Text
              className={`font-figtree-bold text-sm ${selected ? "text-blue-ink" : "text-ink"}`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** S10: the Professionals tab (R07) and the Businesses tab (B03). */
export function DirectoryScreen({
  api,
  initialQuery,
}: {
  api: DirectoryApi;
  initialQuery?: string;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("professionals");
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <ScreenTitle>{t.navPeople}</ScreenTitle>
        <LinkButton
          href="/connections"
          label={t.myConnections}
          className="min-h-[44px] justify-center rounded-[10px] border border-line bg-surface px-4"
        >
          <Text className="font-figtree-semibold text-sm text-ink">{t.myConnections}</Text>
        </LinkButton>
      </View>
      <Text className="font-figtree text-[14px] leading-5 text-ink-2">{t.peopleIntro}</Text>
      <Tabs value={tab} onChange={setTab} />
      {tab === "professionals" ? (
        <ProfessionalsPanel api={api} initialQuery={initialQuery} />
      ) : (
        <BusinessesPanel api={api} />
      )}
    </View>
  );
}

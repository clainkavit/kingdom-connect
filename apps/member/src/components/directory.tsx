import type { Language, Strings, TextKey } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
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
import {
  ClearAll,
  FilterBar,
  FilterMenu,
  FilterOptions,
  SearchBox,
  TextFilter,
} from "./filter-menu";
import { EnterOnChange } from "./motion";
import { FilterSheet, usePhone } from "./filter-sheet";
import { LinkButton } from "./link-button";
import { Avatar } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

type Relation = DirectoryCard["relation"];

/** Connect, or where the two members stand, sized for a card ("wide") or a phone row. */
function RelationAction({ card, wide }: { card: DirectoryCard; wide: boolean }) {
  const { t } = useLanguage();
  const relation: Relation = card.relation;
  const shape = wide
    ? "min-h-[42px] w-full items-center justify-center rounded-[10px]"
    : "min-h-[38px] items-center justify-center rounded-full px-3.5";
  const text = wide ? "text-sm" : "text-[13px]";
  if (relation === "none" || relation === "received") {
    const label = relation === "none" ? t.connect : t.respondInConnections;
    return (
      <LinkButton
        href={relation === "none" ? `/profile/${card.memberId}?connect=1` : "/connections"}
        label={label}
        className={`${shape} border border-navy bg-surface`}
      >
        <Text className={`font-figtree-bold ${text} text-info-text`}>
          {wide || relation === "none" ? label : t.answerShort}
        </Text>
      </LinkButton>
    );
  }
  const sent = relation === "sent";
  return (
    <View
      className={`${shape} ${sent ? "border border-line bg-surface-2" : "bg-good-soft"} ${wide ? "" : "py-1.5"}`}
    >
      <Text className={`font-figtree-bold ${text} ${sent ? "text-ink-2" : "text-good-text"}`}>
        {sent ? (wide ? t.requestSent : t.sentShort) : t.connected}
      </Text>
    </View>
  );
}

const placeLine = (card: DirectoryCard) =>
  [card.headline, card.location].filter(Boolean).join(" · ");

/** A member on a computer: photo, name, what they do and where, top skills, and Connect. */
export function DirectoryCardView({ card, fill }: { card: DirectoryCard; fill?: boolean }) {
  return (
    <View
      className={`${fill ? "flex-1 " : ""}gap-2.5 rounded-[14px] border border-line bg-surface p-[18px]`}
    >
      <LinkButton
        href={`/profile/${card.memberId}`}
        label={[card.fullName, card.headline].filter(Boolean).join(", ")}
        className="flex-row items-center gap-3"
      >
        <Avatar name={card.fullName} url={card.photoUrl} size={52} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-figtree-bold text-base text-ink">{card.fullName}</Text>
          {placeLine(card) ? (
            <Text className="font-figtree text-[13px] text-ink-2">{placeLine(card)}</Text>
          ) : null}
        </View>
      </LinkButton>
      {card.topSkills.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {card.topSkills.map((skill) => (
            <View
              key={skill}
              className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5"
            >
              <Text className="font-figtree text-xs text-ink">{skill}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="mt-auto">
        <RelationAction card={card} wide />
      </View>
    </View>
  );
}

/** A member on a phone: one row of a list, with Connect on the right. */
function DirectoryRow({ card, last }: { card: DirectoryCard; last: boolean }) {
  return (
    <View
      className={`flex-row items-center gap-3 p-3.5 ${last ? "" : "border-b border-blue-soft"}`}
    >
      <LinkButton
        href={`/profile/${card.memberId}`}
        label={[card.fullName, card.headline].filter(Boolean).join(", ")}
        className="min-w-0 flex-1 flex-row items-center gap-3"
      >
        <Avatar name={card.fullName} url={card.photoUrl} size={46} />
        <View className="min-w-0 flex-1">
          <Text className="font-figtree-bold text-[15px] text-ink">{card.fullName}</Text>
          {placeLine(card) ? (
            <Text className="font-figtree text-[13px] text-ink-2">{placeLine(card)}</Text>
          ) : null}
          {card.topSkills.length ? (
            <Text className="font-figtree text-xs text-ink-2">{card.topSkills.join(" · ")}</Text>
          ) : null}
        </View>
      </LinkButton>
      <RelationAction card={card} wide={false} />
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

/** How many of the directory's filters are on; the search words are not a filter. */
function activeFilters(f: DirectoryFilters): number {
  return [f.profession, f.skill, f.sector, f.region, f.district, f.studying].filter(
    (v) => v !== null && v !== "",
  ).length;
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
  row,
  sections,
  footer,
}: {
  failed: boolean;
  results: Results<C> | null;
  emptyTitle: string;
  onRetry: () => void;
  onMore: () => void;
  render: (card: C, fill: boolean) => React.ReactNode;
  row?: (card: C, last: boolean) => React.ReactNode;
  sections?: (cards: C[]) => Section<C>[];
  footer?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const columns = useColumns();
  if (failed) return <ErrorState message={t.directoryLoadFailed} onRetry={onRetry} />;
  if (!results) return <LoadingRows />;
  if (results.cards.length === 0)
    return <EmptyState title={emptyTitle} message={t.noResultsMessage} />;
  const grid = (cards: C[]) => {
    if (columns === 1 && row)
      return (
        <View className="overflow-hidden rounded-[14px] border border-line bg-surface">
          {cards.map((card, i) => row(card, i === cards.length - 1))}
        </View>
      );
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
            <Text
              role="heading"
              aria-level={2}
              className={`font-figtree-bold text-ink ${columns === 1 ? "text-sm" : "mt-2 text-lg"}`}
            >
              {part.title}
            </Text>
          ) : null}
          {grid(part.cards)}
        </View>
      ))}
      {results.more ? <Button secondary label={t.loadMore} onPress={onMore} /> : null}
      {footer}
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

const nameOf = (options: Option[], id: string | null) =>
  id ? (options.find((o) => o.value === id)?.label ?? null) : null;

/** The search box, at full width on a computer and as a rounded pill beside Filters on a phone. */
function SearchRow({
  label,
  value,
  onChange,
  onSearch,
  children,
}: {
  label: string;
  value: string;
  onChange: (q: string) => void;
  onSearch: (q: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const phone = usePhone();
  const box = (
    <SearchBox
      label={label}
      hint={label === t.directorySearch ? t.peopleSearchHint : label}
      value={value}
      onChange={onChange}
      onSearch={onSearch}
      round={phone}
    />
  );
  if (phone)
    return (
      <View className="flex-row items-center gap-2">
        {box}
        {children}
      </View>
    );
  return (
    <FilterBar>
      <View className="min-w-[280px] flex-1 basis-[320px] flex-row">{box}</View>
      {children}
    </FilterBar>
  );
}

function BusinessesPanel({ api }: { api: DirectoryApi }) {
  const { t, language } = useLanguage();
  const phone = usePhone();
  const [draft, setDraft] = useState<BusinessFilters>(noBusinessFilters);
  const [menu, setMenu] = useState<string | null>(null);
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
  const apply = (next: Partial<BusinessFilters>) => {
    const filters = { ...applied, ...next, q: draft.q };
    setDraft(filters);
    setMenu(null);
    run(filters);
  };
  const toggle = (key: string) => setMenu((m) => (m === key ? null : key));
  const count = [applied.sector, applied.level, applied.region].filter((v) => v !== null).length;
  const levels = [
    { value: "2", label: t.badgeBusiness },
    { value: "3", label: t.optionPoster },
  ];
  const cleared = { ...noBusinessFilters, q: draft.q };

  return (
    <>
      <SearchRow
        label={t.businessSearch}
        value={draft.q}
        onChange={(q) => update({ q })}
        onSearch={(q) => run({ ...applied, q })}
      >
        {phone ? (
          <FilterSheet
            count={count}
            onApply={() => run(draft)}
            onClear={() => {
              setDraft(cleared);
              run(cleared);
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
              options={choices(levels)}
              value={draft.level === null ? "" : String(draft.level)}
              onChange={(v) => update({ level: levelChoice[v] ?? null })}
            />
            <ChoiceList
              label={t.region}
              options={choices(regions)}
              value={draft.region ?? ""}
              onChange={(region) => update({ region: region || null })}
            />
          </FilterSheet>
        ) : (
          <>
            <FilterMenu
              label={t.filterSector}
              value={nameOf(sectors, applied.sector)}
              open={menu === "sector"}
              onToggle={() => toggle("sector")}
            >
              <FilterOptions
                options={choices(sectors)}
                value={applied.sector ?? ""}
                onChange={(sector) => apply({ sector: sector || null })}
              />
            </FilterMenu>
            <FilterMenu
              label={t.filterLevel}
              value={nameOf(levels, applied.level === null ? null : String(applied.level))}
              open={menu === "level"}
              onToggle={() => toggle("level")}
            >
              <FilterOptions
                options={choices(levels)}
                value={applied.level === null ? "" : String(applied.level)}
                onChange={(v) => apply({ level: levelChoice[v] ?? null })}
              />
            </FilterMenu>
            <FilterMenu
              label={t.region}
              value={nameOf(regions, applied.region)}
              open={menu === "region"}
              onToggle={() => toggle("region")}
            >
              <FilterOptions
                options={choices(regions)}
                value={applied.region ?? ""}
                onChange={(region) => apply({ region: region || null })}
              />
            </FilterMenu>
            {count ? <ClearAll onPress={() => apply(cleared)} /> : null}
          </>
        )}
      </SearchRow>
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
  const phone = usePhone();
  const [draft, setDraft] = useState<DirectoryFilters>({ ...noFilters, q: initialQuery });
  const [menu, setMenu] = useState<string | null>(null);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const { applied, results, failed, run, loadMore } = useSearch(
    api.search,
    { ...noFilters, q: initialQuery },
    (c: DirectoryCard) => c.memberId,
  );
  const region = phone ? draft.region : applied.region;

  useEffect(() => {
    api.regions(language).then(setRegions);
    api.sectors(language).then(setSectors);
  }, [api, language]);
  useEffect(() => {
    if (region) api.districts(region, language).then(setDistricts);
  }, [api, language, region]);

  const update = (next: Partial<DirectoryFilters>) => setDraft((d) => ({ ...d, ...next }));
  const choices = (options: Option[]) => [{ value: "", label: t.anyOption }, ...options];
  const apply = (next: Partial<DirectoryFilters>) => {
    const filters = { ...applied, ...next, q: draft.q };
    setDraft(filters);
    setMenu(null);
    run(filters);
  };
  const toggle = (key: string) => setMenu((m) => (m === key ? null : key));
  const studying = [
    { value: "yes", label: t.yes },
    { value: "no", label: t.no },
  ];
  const studyingValue = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
  const cleared = { ...noFilters, q: draft.q };

  return (
    <>
      <SearchRow
        label={t.directorySearch}
        value={draft.q}
        onChange={(q) => update({ q })}
        onSearch={(q) => run({ ...applied, q })}
      >
        {phone ? (
          <FilterSheet
            count={activeFilters(applied)}
            onApply={() => run(draft)}
            onClear={() => {
              setDraft(cleared);
              run(cleared);
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
              onChange={(r) => update({ region: r || null, district: null })}
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
              options={choices(studying)}
              value={studyingValue(draft.studying)}
              onChange={(v) => update({ studying: v === "" ? null : v === "yes" })}
            />
          </FilterSheet>
        ) : (
          <>
            <FilterMenu
              label={t.region}
              value={nameOf(regions, applied.region)}
              open={menu === "region"}
              onToggle={() => toggle("region")}
            >
              <FilterOptions
                options={choices(regions)}
                value={applied.region ?? ""}
                onChange={(r) => apply({ region: r || null, district: null })}
              />
            </FilterMenu>
            {applied.region ? (
              <FilterMenu
                label={t.district}
                value={nameOf(districts, applied.district)}
                open={menu === "district"}
                onToggle={() => toggle("district")}
              >
                <FilterOptions
                  options={choices(districts)}
                  value={applied.district ?? ""}
                  onChange={(district) => apply({ district: district || null })}
                />
              </FilterMenu>
            ) : null}
            <FilterMenu
              label={t.filterProfession}
              value={applied.profession || null}
              open={menu === "profession"}
              onToggle={() => toggle("profession")}
            >
              <TextFilter
                label={t.filterProfession}
                value={applied.profession}
                onApply={(profession) => apply({ profession })}
              />
            </FilterMenu>
            <FilterMenu
              label={t.filterSkill}
              value={applied.skill || null}
              open={menu === "skill"}
              onToggle={() => toggle("skill")}
            >
              <TextFilter
                label={t.filterSkill}
                value={applied.skill}
                onApply={(skill) => apply({ skill })}
              />
            </FilterMenu>
            <FilterMenu
              label={t.filterSector}
              value={nameOf(sectors, applied.sector)}
              open={menu === "sector"}
              onToggle={() => toggle("sector")}
            >
              <FilterOptions
                options={choices(sectors)}
                value={applied.sector ?? ""}
                onChange={(sector) => apply({ sector: sector || null })}
              />
            </FilterMenu>
            <FilterMenu
              label={t.filterStudying}
              value={nameOf(studying, studyingValue(applied.studying) || null)}
              open={menu === "studying"}
              onToggle={() => toggle("studying")}
            >
              <FilterOptions
                options={choices(studying)}
                value={studyingValue(applied.studying)}
                onChange={(v) => apply({ studying: v === "" ? null : v === "yes" })}
              />
            </FilterMenu>
            {activeFilters(applied) ? <ClearAll onPress={() => apply(cleared)} /> : null}
          </>
        )}
      </SearchRow>
      <ResultList
        failed={failed}
        results={results}
        emptyTitle={t.noResultsTitle}
        onRetry={() => run(applied)}
        onMore={loadMore}
        render={(card, fill) => <DirectoryCardView key={card.memberId} card={card} fill={fill} />}
        row={(card, last) => <DirectoryRow key={card.memberId} card={card} last={last} />}
        sections={applied.q.trim() ? undefined : (cards) => nearSections(t, cards)}
        footer={
          phone ? (
            <Text className="font-figtree text-[13px] leading-[19px] text-ink-2">
              {t.peoplePrivacyNote}
            </Text>
          ) : null
        }
      />
    </>
  );
}

type Tab = "professionals" | "businesses";

/** Professionals and Businesses: pills on a computer, a two-part switch on a phone. */
function Tabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useLanguage();
  const phone = usePhone();
  const tabs: { key: Tab; label: string }[] = [
    { key: "professionals", label: t.tabProfessionals },
    { key: "businesses", label: t.tabBusinesses },
  ];
  return (
    <View
      role="tablist"
      className={
        phone
          ? "flex-row rounded-xl border border-line bg-surface-2 p-1"
          : "flex-row flex-wrap gap-2"
      }
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        const look = phone
          ? `min-h-[38px] flex-1 items-center justify-center rounded-[9px] ${selected ? "bg-surface shadow-sm" : ""}`
          : `min-h-[40px] justify-center rounded-full px-4 ${selected ? "bg-navy" : "border border-line bg-surface"}`;
        const text = phone
          ? selected
            ? "font-figtree-bold text-ink"
            : "font-figtree-semibold text-ink-2"
          : selected
            ? "font-figtree-bold text-blue-ink"
            : "font-figtree-semibold text-ink";
        return (
          <Pressable
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onPress={() => onChange(tab.key)}
            className={look}
          >
            <Text className={`text-sm ${text}`}>{tab.label}</Text>
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
  const phone = usePhone();
  const [tab, setTab] = useState<Tab>("professionals");
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <ScreenTitle>{t.navPeople}</ScreenTitle>
          {phone ? null : (
            <Text className="font-figtree text-[15px] text-ink-2">{t.peopleIntro}</Text>
          )}
        </View>
        <LinkButton
          href="/connections"
          label={t.myConnections}
          className="min-h-[44px] justify-center"
        >
          <Text className={`font-figtree-bold text-blue ${phone ? "text-sm" : "text-[15px]"}`}>
            {t.myConnections}
          </Text>
        </LinkButton>
      </View>
      <Tabs value={tab} onChange={setTab} />
      <EnterOnChange value={tab} className="gap-4">
        {tab === "professionals" ? (
          <ProfessionalsPanel api={api} initialQuery={initialQuery} />
        ) : (
          <BusinessesPanel api={api} />
        )}
      </EnterOnChange>
    </View>
  );
}

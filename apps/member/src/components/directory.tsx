import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  noFilters,
  type DirectoryApi,
  type DirectoryCard,
  type DirectoryFilters,
} from "../lib/directory";
import { useLanguage } from "../lib/language";
import type { Option } from "../lib/registration";
import { Button, ChoiceList, Field } from "./form";
import { LinkButton } from "./link-button";
import { Avatar } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function Card({ card }: { card: DirectoryCard }) {
  const { t } = useLanguage();
  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
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
      <View className="flex-row flex-wrap items-center gap-3">
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

type Results = { cards: DirectoryCard[]; more: boolean; page: number };

/** S10: find members by name, profession, skill and place. */
export function DirectoryScreen({ api }: { api: DirectoryApi }) {
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState<DirectoryFilters>(noFilters);
  const [applied, setApplied] = useState<DirectoryFilters>(noFilters);
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);

  useEffect(() => {
    api.regions(language).then(setRegions);
    api.sectors(language).then(setSectors);
  }, [api, language]);
  useEffect(() => {
    if (draft.region) api.districts(draft.region, language).then(setDistricts);
  }, [api, language, draft.region]);

  useEffect(() => {
    let live = true;
    api.search(applied, 0, language).then(
      (page) => live && setResults({ ...page, page: 0 }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, applied, language, attempt]);

  const run = (filters: DirectoryFilters) => {
    setFailed(false);
    setResults(null);
    setApplied(filters);
    setAttempt((a) => a + 1);
  };

  const loadMore = async () => {
    if (!results) return;
    const next = results.page + 1;
    const page = await api.search(applied, next, language).catch(() => null);
    if (!page) return setFailed(true);
    const seen = new Set(results.cards.map((c) => c.memberId));
    const fresh = page.cards.filter((c) => !seen.has(c.memberId));
    setResults({ cards: [...results.cards, ...fresh], more: page.more, page: next });
  };

  const update = (next: Partial<DirectoryFilters>) => setDraft((d) => ({ ...d, ...next }));
  const choices = (options: Option[]) => [{ value: "", label: t.anyOption }, ...options];

  return (
    <View className="gap-4">
      <ScreenTitle>{t.navPeople}</ScreenTitle>
      <View className="gap-3 rounded-card border border-line bg-surface p-4">
        <Field label={t.directorySearch} value={draft.q} onChange={(q) => update({ q })} />
        <Text role="heading" aria-level={2} className="font-figtree-bold text-sm text-ink">
          {t.filtersTitle}
        </Text>
        <View className="gap-3">
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
        </View>
        <View className="flex-row flex-wrap gap-2">
          <View className="min-w-[140px] flex-1">
            <Button label={t.searchButton} onPress={() => run(draft)} />
          </View>
          <View className="min-w-[140px] flex-1">
            <Button
              secondary
              label={t.clearFilters}
              onPress={() => {
                setDraft(noFilters);
                run(noFilters);
              }}
            />
          </View>
        </View>
      </View>
      {failed ? (
        <ErrorState message={t.directoryLoadFailed} onRetry={() => run(applied)} />
      ) : !results ? (
        <LoadingRows />
      ) : results.cards.length === 0 ? (
        <EmptyState title={t.noResultsTitle} message={t.noResultsMessage} />
      ) : (
        <View className="gap-3">
          {results.cards.map((card) => (
            <Card key={card.memberId} card={card} />
          ))}
          {results.more ? <Button secondary label={t.loadMore} onPress={loadMore} /> : null}
        </View>
      )}
    </View>
  );
}

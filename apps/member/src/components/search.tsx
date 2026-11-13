import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import {
  SEARCH_MIN_LENGTH,
  searchEverything,
  type SearchDeps,
  type SearchResults,
} from "../lib/search";
import type { TrainingItem } from "../lib/training";
import { DirectoryCardView } from "./directory";
import { LinkButton } from "./link-button";
import { OpportunityCardView } from "./opportunities";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <View className="gap-3">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {title} · {count}
      </Text>
      {count === 0 ? (
        <Text className="font-figtree text-sm text-ink-2">{t.searchNoneInSection}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function TrainingResult({ item }: { item: TrainingItem }) {
  return (
    <LinkButton
      href={`/training/${item.id}`}
      label={item.title}
      className="gap-1 rounded-card border border-line bg-surface p-4"
    >
      <Text className="font-figtree-bold text-[15px] text-ink">{item.title}</Text>
      {item.provider ? (
        <Text className="font-figtree text-[13px] text-ink-2">{item.provider}</Text>
      ) : null}
    </LinkButton>
  );
}

/** R22: what the top bar's search box found, in People, Opportunities and Training. */
export function SearchScreen({ q, deps }: { q: string; deps: SearchDeps }) {
  const { t, language } = useLanguage();
  const query = q.trim();
  const tooShort = query.length < SEARCH_MIN_LENGTH;
  const [attempt, setAttempt] = useState(0);
  const key = `${language}|${attempt}|${query}`;
  const [answer, setAnswer] = useState<{
    key: string;
    results: SearchResults | null;
  } | null>(null);

  useEffect(() => {
    if (tooShort) return;
    let live = true;
    searchEverything(query, language, deps).then(
      (results) => live && setAnswer({ key, results }),
      () => live && setAnswer({ key, results: null }),
    );
    return () => {
      live = false;
    };
  }, [key, query, language, deps, tooShort]);

  const state =
    answer?.key !== key
      ? ({ kind: "loading" } as const)
      : answer.results
        ? ({ kind: "done", results: answer.results } as const)
        : ({ kind: "failed" } as const);

  if (tooShort)
    return (
      <View className="gap-3">
        <ScreenTitle>{t.searchTitle}</ScreenTitle>
        <Text className="font-figtree text-[15px] text-ink-2">{t.searchTypeMore}</Text>
      </View>
    );

  return (
    <View className="gap-6">
      <ScreenTitle>{t.searchResultsFor(query)}</ScreenTitle>
      {state.kind === "loading" ? (
        <LoadingRows />
      ) : state.kind === "failed" ? (
        <ErrorState message={t.searchFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : state.results.people.length +
          state.results.opportunities.length +
          state.results.training.length ===
        0 ? (
        <Text className="font-figtree text-[15px] text-ink-2">{t.searchNothing(query)}</Text>
      ) : (
        <>
          <Section title={t.navPeople} count={state.results.people.length}>
            {state.results.people.map((card) => (
              <DirectoryCardView key={card.memberId} card={card} />
            ))}
            {state.results.morePeople ? (
              <LinkButton
                href={`/people?q=${encodeURIComponent(query)}`}
                label={t.searchSeeAllPeople}
                className="min-h-[44px] justify-center self-start"
              >
                <Text className="font-figtree-semibold text-sm text-blue">
                  {t.searchSeeAllPeople}
                </Text>
              </LinkButton>
            ) : null}
          </Section>
          <Section title={t.navOpportunities} count={state.results.opportunities.length}>
            {state.results.opportunities.map((post) => (
              <OpportunityCardView key={post.id} post={post} />
            ))}
          </Section>
          <Section title={t.navTraining} count={state.results.training.length}>
            {state.results.training.map((item) => (
              <TrainingResult key={item.id} item={item} />
            ))}
          </Section>
        </>
      )}
    </View>
  );
}

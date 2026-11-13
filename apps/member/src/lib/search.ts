import type { Language } from "@kingdom-connect/shared";
import { noFilters, type DirectoryApi, type DirectoryCard } from "./directory";
import { card, type CardRow, type OpportunityCard } from "./opportunity-browse";
import { supabase } from "./supabase";
import { trainingFromRow, type FeedRow, type TrainingItem } from "./training";

/** How many people the Search page shows before "See all". */
export const SEARCH_SECTION_SIZE = 5;
/** Searches shorter than this are not run. */
export const SEARCH_MIN_LENGTH = 2;

export type SearchResults = {
  people: DirectoryCard[];
  morePeople: boolean;
  opportunities: OpportunityCard[];
  training: TrainingItem[];
};

export type SearchDeps = {
  directory: Pick<DirectoryApi, "search">;
  opportunities: { search: (q: string) => Promise<OpportunityCard[]> };
  training: { search: (q: string) => Promise<TrainingItem[]> };
};

/** R23: open posts and upcoming training whose text holds every word, matched on the server. */
export const serverSearch: Pick<SearchDeps, "opportunities" | "training"> = {
  opportunities: {
    async search(q) {
      const { data, error } = await supabase.rpc("search_opportunities", { q });
      if (error) throw error;
      return (data as CardRow[]).map(card);
    },
  },
  training: {
    async search(q) {
      const { data, error } = await supabase.rpc("search_trainings", { q });
      if (error) throw error;
      return (data as FeedRow[]).map(trainingFromRow);
    },
  },
};

/** People, opportunities and training that match the words. */
export async function searchEverything(
  q: string,
  language: Language,
  deps: SearchDeps,
): Promise<SearchResults> {
  const query = q.trim();
  const [people, opportunities, training] = await Promise.all([
    deps.directory.search({ ...noFilters, q: query }, 0, language),
    deps.opportunities.search(query),
    deps.training.search(query),
  ]);
  return {
    people: people.cards.slice(0, SEARCH_SECTION_SIZE),
    morePeople: people.more || people.cards.length > SEARCH_SECTION_SIZE,
    opportunities,
    training,
  };
}

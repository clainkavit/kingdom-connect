import type { Language } from "@kingdom-connect/shared";
import { noFilters, type DirectoryApi, type DirectoryCard } from "./directory";
import type { OpportunityBrowseApi, OpportunityCard } from "./opportunity-browse";
import type { TrainingApi, TrainingItem } from "./training";

/** How many results each section of the Search page shows before "See all". */
export const SEARCH_SECTION_SIZE = 5;
/** Searches shorter than this are not run. */
export const SEARCH_MIN_LENGTH = 2;
/** Opportunities have no word search on the server, so the newest open posts are read and matched here. */
const OPPORTUNITY_PAGES = 3;

export type SearchResults = {
  people: DirectoryCard[];
  morePeople: boolean;
  opportunities: OpportunityCard[];
  training: TrainingItem[];
};

export type SearchDeps = {
  directory: Pick<DirectoryApi, "search">;
  opportunities: Pick<OpportunityBrowseApi, "list">;
  training: Pick<TrainingApi, "feed">;
};

/** True when every word typed appears somewhere in the given texts, ignoring case. */
export function matchesQuery(q: string, texts: (string | null | undefined)[]): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

async function newestOpportunities(api: SearchDeps["opportunities"]): Promise<OpportunityCard[]> {
  const cards: OpportunityCard[] = [];
  for (let page = 0; page < OPPORTUNITY_PAGES; page++) {
    const next = await api.list({}, page);
    cards.push(...next);
    if (next.length === 0) break;
  }
  return cards;
}

/** People, opportunities and training that match the words, using the searches members already have. */
export async function searchEverything(
  q: string,
  language: Language,
  deps: SearchDeps,
): Promise<SearchResults> {
  const query = q.trim();
  const [people, opportunities, training] = await Promise.all([
    deps.directory.search({ ...noFilters, q: query }, 0, language),
    newestOpportunities(deps.opportunities),
    deps.training.feed(),
  ]);
  return {
    people: people.cards.slice(0, SEARCH_SECTION_SIZE),
    morePeople: people.more || people.cards.length > SEARCH_SECTION_SIZE,
    opportunities: opportunities.filter((o) =>
      matchesQuery(query, [o.title, o.role, o.posterName, ...o.skills]),
    ),
    training: training.filter(
      (t) =>
        t.status === "published" && matchesQuery(query, [t.title, t.provider, t.details, t.venue]),
    ),
  };
}

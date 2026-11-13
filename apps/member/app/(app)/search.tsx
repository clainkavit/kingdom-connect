import { useLocalSearchParams } from "expo-router";
import { SearchScreen } from "../../src/components/search";
import { directoryApi } from "../../src/lib/directory";
import { opportunityBrowseApi } from "../../src/lib/opportunity-browse";
import type { SearchDeps } from "../../src/lib/search";
import { trainingApi } from "../../src/lib/training";

const deps: SearchDeps = {
  directory: directoryApi,
  opportunities: opportunityBrowseApi,
  training: trainingApi,
};

export default function SearchRoute() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <SearchScreen q={typeof q === "string" ? q : ""} deps={deps} />;
}

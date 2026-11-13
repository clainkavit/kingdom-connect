import { useLocalSearchParams } from "expo-router";
import { SearchScreen } from "../../src/components/search";
import { directoryApi } from "../../src/lib/directory";
import { serverSearch, type SearchDeps } from "../../src/lib/search";

const deps: SearchDeps = {
  directory: directoryApi,
  ...serverSearch,
};

export default function SearchRoute() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <SearchScreen q={typeof q === "string" ? q : ""} deps={deps} />;
}

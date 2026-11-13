import { useLocalSearchParams } from "expo-router";
import { DirectoryScreen } from "../../src/components/directory";
import { directoryApi } from "../../src/lib/directory";

export default function PeopleScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <DirectoryScreen api={directoryApi} initialQuery={typeof q === "string" ? q : ""} />;
}

import { useLocalSearchParams } from "expo-router";
import { IdeaSummaryScreen } from "../../../../src/components/ideas-pool";
import { ideaAccessApi } from "../../../../src/lib/idea-access";
import { ideasApi } from "../../../../src/lib/ideas";

export default function IdeaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IdeaSummaryScreen key={id} api={ideasApi} access={ideaAccessApi} ideaId={id ?? ""} />;
}

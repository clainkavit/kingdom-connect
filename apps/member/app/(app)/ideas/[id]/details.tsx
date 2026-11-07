import { useLocalSearchParams } from "expo-router";
import { IdeaDetailsScreen } from "../../../../src/components/idea-details";
import { ideaAccessApi } from "../../../../src/lib/idea-access";
import { memberIdeaDetailsApi } from "../../../../src/lib/idea-details-api";

export default function IdeaDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <IdeaDetailsScreen
      key={id}
      api={memberIdeaDetailsApi}
      access={ideaAccessApi}
      ideaId={id ?? ""}
    />
  );
}

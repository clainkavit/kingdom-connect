import { useLocalSearchParams } from "expo-router";
import { OpportunityDetailScreen } from "../../../../src/components/opportunities";
import { RespondPanel } from "../../../../src/components/responses";
import { opportunityBrowseApi } from "../../../../src/lib/opportunity-browse";
import { memberResponsesApi } from "../../../../src/lib/responses-api";

export default function OpportunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OpportunityDetailScreen
      key={id}
      api={opportunityBrowseApi}
      id={id ?? ""}
      respond={(post) => <RespondPanel api={memberResponsesApi} post={post} />}
    />
  );
}

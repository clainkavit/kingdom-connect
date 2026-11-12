import { useLocalSearchParams } from "expo-router";
import { OpportunityDetailScreen } from "../../../../src/components/opportunities";
import { opportunityBrowseApi } from "../../../../src/lib/opportunity-browse";

export default function OpportunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OpportunityDetailScreen key={id} api={opportunityBrowseApi} id={id ?? ""} />;
}

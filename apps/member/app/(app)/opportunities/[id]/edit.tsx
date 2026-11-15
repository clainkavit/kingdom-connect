import { useLocalSearchParams } from "expo-router";
import { OpportunityFormScreen } from "../../../../src/components/opportunity-form";
import { opportunitiesApi } from "../../../../src/lib/opportunities";
import { picksApi } from "../../../../src/lib/picks";

export default function EditOpportunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OpportunityFormScreen key={id} api={opportunitiesApi} picks={picksApi} id={id ?? ""} />;
}

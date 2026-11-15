import { OpportunityFormScreen } from "../../../src/components/opportunity-form";
import { opportunitiesApi } from "../../../src/lib/opportunities";
import { picksApi } from "../../../src/lib/picks";

export default function NewOpportunityScreen() {
  return <OpportunityFormScreen api={opportunitiesApi} picks={picksApi} />;
}

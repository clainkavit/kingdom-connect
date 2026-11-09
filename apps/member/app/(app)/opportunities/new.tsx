import { OpportunityFormScreen } from "../../../src/components/opportunity-form";
import { opportunitiesApi } from "../../../src/lib/opportunities";

export default function NewOpportunityScreen() {
  return <OpportunityFormScreen api={opportunitiesApi} />;
}

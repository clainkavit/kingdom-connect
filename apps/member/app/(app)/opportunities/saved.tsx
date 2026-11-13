import { SavedOpportunities } from "../../../src/components/opportunities";
import { opportunityBrowseApi } from "../../../src/lib/opportunity-browse";

export default function SavedRoute() {
  return <SavedOpportunities api={opportunityBrowseApi} />;
}

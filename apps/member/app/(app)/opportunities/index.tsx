import { OpportunitiesList } from "../../../src/components/opportunities";
import { opportunityBrowseApi } from "../../../src/lib/opportunity-browse";

export default function OpportunitiesScreen() {
  return <OpportunitiesList api={opportunityBrowseApi} />;
}

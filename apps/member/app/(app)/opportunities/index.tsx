import { OpportunitiesList } from "../../../src/components/opportunities";
import { jobAlertsApi } from "../../../src/lib/job-alerts";
import { opportunityBrowseApi } from "../../../src/lib/opportunity-browse";

export default function OpportunitiesScreen() {
  return <OpportunitiesList api={opportunityBrowseApi} alerts={jobAlertsApi} />;
}

import { POSTER_LEVEL } from "@kingdom-connect/shared";
import { OpportunitiesList } from "../../../src/components/opportunities";
import { dashboardApi } from "../../../src/lib/dashboard";
import { jobAlertsApi } from "../../../src/lib/job-alerts";
import { opportunityBrowseApi } from "../../../src/lib/opportunity-browse";

const canPost = () =>
  dashboardApi.welcome().then((w) => !!w && w.level >= POSTER_LEVEL && !w.postingPaused);

export default function OpportunitiesScreen() {
  return <OpportunitiesList api={opportunityBrowseApi} alerts={jobAlertsApi} canPost={canPost} />;
}

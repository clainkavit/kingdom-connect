import { JobAlertsScreen } from "../../../src/components/job-alerts";
import { jobAlertsApi } from "../../../src/lib/job-alerts";

export default function JobAlertsRoute() {
  return <JobAlertsScreen api={jobAlertsApi} />;
}

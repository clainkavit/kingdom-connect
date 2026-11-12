import { DashboardScreen } from "../../src/components/dashboard";
import { connectionsApi } from "../../src/lib/connections";
import { dashboardApi } from "../../src/lib/dashboard";
import { dashboardWidgetsApi } from "../../src/lib/dashboard-widgets";
import { memberNewsApi } from "../../src/lib/news";
import { peopleYouMayKnowApi } from "../../src/lib/people-you-may-know";

export default function DashboardPage() {
  return (
    <DashboardScreen
      api={dashboardApi}
      connections={connectionsApi}
      widgets={dashboardWidgetsApi}
      news={memberNewsApi}
      people={peopleYouMayKnowApi}
    />
  );
}

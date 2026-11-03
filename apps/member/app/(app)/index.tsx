import { DashboardScreen } from "../../src/components/dashboard";
import { connectionsApi } from "../../src/lib/connections";
import { dashboardApi } from "../../src/lib/dashboard";

export default function DashboardPage() {
  return <DashboardScreen api={dashboardApi} connections={connectionsApi} />;
}

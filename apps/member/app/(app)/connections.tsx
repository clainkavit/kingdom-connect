import { ConnectionsScreen } from "../../src/components/connections";
import { connectionsApi } from "../../src/lib/connections";

export default function ConnectionsPage() {
  return <ConnectionsScreen api={connectionsApi} />;
}

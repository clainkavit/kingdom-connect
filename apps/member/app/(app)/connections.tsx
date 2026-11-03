import { ConnectionsScreen } from "../../src/components/connections";
import { connectionsApi } from "../../src/lib/connections";
import { memberMessagesApi } from "../../src/lib/messages-api";

export default function ConnectionsPage() {
  return <ConnectionsScreen api={connectionsApi} messagesApi={memberMessagesApi} />;
}

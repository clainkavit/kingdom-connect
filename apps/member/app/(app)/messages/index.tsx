import { InboxScreen } from "../../../src/components/messages";
import { memberMessagesApi } from "../../../src/lib/messages-api";

export default function MessagesScreen() {
  return <InboxScreen api={memberMessagesApi} />;
}

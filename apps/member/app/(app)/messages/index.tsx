import { InboxScreen, MessagesTwoPane } from "../../../src/components/messages";
import { usePhone } from "../../../src/components/sheet";
import { memberMessagesApi } from "../../../src/lib/messages-api";

export default function MessagesScreen() {
  const phone = usePhone();
  return phone ? (
    <InboxScreen api={memberMessagesApi} />
  ) : (
    <MessagesTwoPane api={memberMessagesApi} />
  );
}

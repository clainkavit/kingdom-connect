import { useLocalSearchParams } from "expo-router";
import { MessagesTwoPane, ThreadScreen } from "../../../src/components/messages";
import { usePhone } from "../../../src/components/sheet";
import { memberMessagesApi } from "../../../src/lib/messages-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SUCH_THREAD = "00000000-0000-0000-0000-000000000000";

export default function ThreadPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const phone = usePhone();
  const threadId = UUID.test(id ?? "") ? id! : NO_SUCH_THREAD;
  return phone ? (
    <ThreadScreen key={id} api={memberMessagesApi} threadId={threadId} />
  ) : (
    <MessagesTwoPane api={memberMessagesApi} threadId={threadId} />
  );
}

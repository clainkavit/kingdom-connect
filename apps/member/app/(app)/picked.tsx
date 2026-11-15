import { PickedInvites } from "../../src/components/picks";
import { picksApi } from "../../src/lib/picks";

export default function PickedScreen() {
  return <PickedInvites api={picksApi} />;
}

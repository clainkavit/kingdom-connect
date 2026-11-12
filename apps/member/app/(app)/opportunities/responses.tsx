import { MyResponses } from "../../../src/components/responses";
import { memberResponsesApi } from "../../../src/lib/responses-api";

export default function MyResponsesScreen() {
  return <MyResponses api={memberResponsesApi} />;
}

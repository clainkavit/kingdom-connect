import { useLocalSearchParams } from "expo-router";
import { PostResponses } from "../../../../src/components/responses";
import { memberResponsesApi } from "../../../../src/lib/responses-api";

export default function PostResponsesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostResponses key={id} api={memberResponsesApi} opportunityId={id ?? ""} />;
}

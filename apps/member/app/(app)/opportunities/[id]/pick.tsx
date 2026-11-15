import { useLocalSearchParams } from "expo-router";
import { PickProgress } from "../../../../src/components/picks";
import { picksApi } from "../../../../src/lib/picks";

export default function PickProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PickProgress key={id} api={picksApi} opportunityId={id ?? ""} />;
}

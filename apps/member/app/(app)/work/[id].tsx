import { useLocalSearchParams } from "expo-router";
import { RateWork } from "../../../src/components/work";
import { workApi } from "../../../src/lib/work";

export default function RateWorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RateWork key={id} api={workApi} engagementId={id ?? ""} />;
}

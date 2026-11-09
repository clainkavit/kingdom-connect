import { useLocalSearchParams } from "expo-router";
import { PlanScreen } from "../../../src/components/plans";
import { plansApi } from "../../../src/lib/plans-api";

export default function PlanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlanScreen key={id} api={plansApi} planId={id ?? ""} />;
}

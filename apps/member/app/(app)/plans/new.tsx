import { useLocalSearchParams } from "expo-router";
import { ProposePlan } from "../../../src/components/plans";
import { plansApi } from "../../../src/lib/plans";

export default function ProposePlanScreen() {
  const { idea, with: other } = useLocalSearchParams<{ idea?: string; with?: string }>();
  return <ProposePlan api={plansApi} ideaId={idea ?? null} otherId={other ?? null} />;
}

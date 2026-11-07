import { useLocalSearchParams } from "expo-router";
import { TrainingDetail } from "../../../src/components/training";
import { trainingApi } from "../../../src/lib/training";

export default function TrainingItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrainingDetail key={id} api={trainingApi} trainingId={id ?? ""} />;
}

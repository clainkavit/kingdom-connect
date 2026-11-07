import { useLocalSearchParams } from "expo-router";
import { TrainingForm } from "../../../src/components/training";
import { trainingApi } from "../../../src/lib/training";

export default function NewTrainingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <TrainingForm key={id ?? "new"} api={trainingApi} trainingId={id ?? null} />;
}

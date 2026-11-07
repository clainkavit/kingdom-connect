import { useLocalSearchParams } from "expo-router";
import { TrainingDetail } from "../../../src/components/training";
import { memberMaterialsApi } from "../../../src/lib/materials-api";
import { trainingApi } from "../../../src/lib/training";

export default function TrainingItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <TrainingDetail
      key={id}
      api={trainingApi}
      materials={memberMaterialsApi}
      trainingId={id ?? ""}
    />
  );
}

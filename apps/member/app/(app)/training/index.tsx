import { TrainingList } from "../../../src/components/training";
import { trainingApi } from "../../../src/lib/training";

export default function TrainingScreen() {
  return <TrainingList api={trainingApi} />;
}

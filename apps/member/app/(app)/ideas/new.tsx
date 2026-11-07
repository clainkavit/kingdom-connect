import { useLocalSearchParams } from "expo-router";
import { IdeaForm } from "../../../src/components/ideas";
import { ideasApi } from "../../../src/lib/ideas";

export default function ShareIdeaScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <IdeaForm key={id ?? "new"} api={ideasApi} ideaId={id ?? null} />;
}

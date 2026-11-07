import { MyIdeas } from "../../../src/components/ideas";
import { ideasApi } from "../../../src/lib/ideas";

export default function MyIdeasScreen() {
  return <MyIdeas api={ideasApi} />;
}

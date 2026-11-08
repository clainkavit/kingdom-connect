import { MyIdeas } from "../../../src/components/ideas";
import { ideasApi } from "../../../src/lib/ideas";

export default function IdeasScreen() {
  return <MyIdeas api={ideasApi} />;
}

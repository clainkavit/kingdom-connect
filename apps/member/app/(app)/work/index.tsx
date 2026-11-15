import { MyWork } from "../../../src/components/work";
import { workApi } from "../../../src/lib/work";

export default function MyWorkScreen() {
  return <MyWork api={workApi} />;
}

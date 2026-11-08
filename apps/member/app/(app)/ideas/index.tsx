import { IdeasPool } from "../../../src/components/ideas-pool";
import { ideasApi } from "../../../src/lib/ideas";

export default function IdeasScreen() {
  return <IdeasPool api={ideasApi} />;
}

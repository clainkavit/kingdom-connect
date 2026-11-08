import { IdeasPool } from "../../../src/components/ideas-pool";
import { ideasApi } from "../../../src/lib/ideas";
import { investorApi } from "../../../src/lib/investor";

export default function IdeasScreen() {
  return <IdeasPool api={ideasApi} investor={investorApi} />;
}

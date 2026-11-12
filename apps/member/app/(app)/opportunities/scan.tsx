import { ScanScreen } from "../../../src/components/scan";
import { scanApi } from "../../../src/lib/scan";

export default function ScanOpportunitiesScreen() {
  return <ScanScreen api={scanApi} />;
}

import { InvestorApply } from "../../../src/components/investor";
import { ideasApi } from "../../../src/lib/ideas";
import { investorApi } from "../../../src/lib/investor";

export default function InvestorToolsScreen() {
  return <InvestorApply ideas={ideasApi} investor={investorApi} />;
}

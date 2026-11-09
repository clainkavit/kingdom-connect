import { MyPlans } from "../../../src/components/plans";
import { plansApi } from "../../../src/lib/plans-api";

export default function PlansScreen() {
  return <MyPlans api={plansApi} />;
}

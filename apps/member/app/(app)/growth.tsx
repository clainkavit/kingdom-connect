import { GrowthScreen } from "../../src/components/growth";
import { eventsApi } from "../../src/lib/events";
import { plansApi } from "../../src/lib/plans-api";
import { trainingApi } from "../../src/lib/training";

export default function GrowthPage() {
  return <GrowthScreen events={eventsApi} training={trainingApi} plans={plansApi} />;
}

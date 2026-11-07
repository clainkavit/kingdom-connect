import { EventsList } from "../../../src/components/events";
import { eventsApi } from "../../../src/lib/events";

export default function EventsScreen() {
  return <EventsList api={eventsApi} />;
}

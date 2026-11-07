import { useLocalSearchParams } from "expo-router";
import { EventDetail } from "../../../src/components/events";
import { eventsApi } from "../../../src/lib/events";

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetail key={id} api={eventsApi} eventId={id ?? ""} />;
}

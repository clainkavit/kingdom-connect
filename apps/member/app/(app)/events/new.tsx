import { useLocalSearchParams } from "expo-router";
import { EventForm } from "../../../src/components/events";
import { eventsApi } from "../../../src/lib/events";

export default function NewEventScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <EventForm key={id ?? "new"} api={eventsApi} eventId={id ?? null} />;
}

import {
  calendarLink,
  checkEvent,
  formatDateTime,
  type EventDraft,
  type EventProblem,
  type Strings,
} from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { EventItem, EventsApi, Registrant } from "../lib/events";
import { Button, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows, LockedState } from "./states";
import { useAct } from "./look";

type Loaded<T> = { state: "loading" } | { state: "failed" } | { state: "ready"; value: T };

export function useLoad<T>(load: () => Promise<T>, attempt: number): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    setLoaded({ state: "loading" });
    load().then(
      (value) => live && setLoaded({ state: "ready", value }),
      () => live && setLoaded({ state: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return loaded;
}

function placesLine(t: Strings, event: EventItem): string {
  const left = Math.max(event.capacity - event.registered, 0);
  return left > 0 ? t.eventsPlacesLeft(left, event.capacity) : t.eventsFull;
}

function whereLine(t: Strings, event: EventItem): string {
  return event.venue ?? t.eventsOnline;
}

function StatusLine({ event }: { event: EventItem }) {
  const { t } = useLanguage();
  if (event.status === "pending_review") {
    return (
      <Text className="font-figtree-semibold text-[13px] text-warn-text">
        {t.eventsStatusPending}
      </Text>
    );
  }
  if (event.status === "draft") {
    return (
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {event.reviewReason ? t.eventsReviewReason(event.reviewReason) : t.eventsStatusDraft}
      </Text>
    );
  }
  if (event.myStatus === "registered") {
    return (
      <Text className="font-figtree-semibold text-[13px] text-good-text">{t.eventsRegistered}</Text>
    );
  }
  if (event.myStatus === "waitlisted" && event.myWaitlistPosition) {
    return (
      <Text className="font-figtree-semibold text-[13px] text-warn-text">
        {t.eventsWaitlisted(event.myWaitlistPosition)}
      </Text>
    );
  }
  return <Text className="font-figtree text-[13px] text-ink-2">{placesLine(t, event)}</Text>;
}

/** S38: upcoming events, and the member's own drafts and events waiting for review (T03). */
export function EventsList({ api }: { api: EventsApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    () =>
      Promise.all([api.feed(), api.canPost()]).then(([events, canPost]) => ({ events, canPost })),
    attempt,
  );

  return (
    <View>
      <ScreenTitle>{t.navEvents}</ScreenTitle>
      {loaded.state === "failed" ? (
        <ErrorState message={t.eventsLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : (
        <View className="gap-3">
          {loaded.value.canPost ? (
            <LinkButton
              href="/events/new"
              label={t.eventsPost}
              className="min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4"
            >
              <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.eventsPost}</Text>
            </LinkButton>
          ) : (
            <LockedState
              screenName={t.eventsPost}
              reason={t.eventsLockedReason}
              action={{ label: t.eventsLockedAction, href: "/business" }}
            />
          )}
          {loaded.value.events.length === 0 ? (
            <EmptyState title={t.eventsEmptyTitle} message={t.eventsEmptyMessage} />
          ) : (
            loaded.value.events.map((event) => (
              <LinkButton
                key={event.id}
                href={`/events/${event.id}`}
                label={event.title}
                className="gap-1 rounded-card border border-line bg-surface p-4"
              >
                <Text className="font-figtree-bold text-[16px] text-ink">{event.title}</Text>
                <Text className="font-figtree text-[14px] text-ink">
                  {formatDateTime(new Date(event.startsAt), language)} · {whereLine(t, event)}
                </Text>
                <StatusLine event={event} />
              </LinkButton>
            ))
          )}
        </View>
      )}
    </View>
  );
}

/** The poster's registrant list, by name and headline: never contact details. Shared with training (T01). */
export function Registrants({ load }: { load: () => Promise<Registrant[]> }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad<Registrant[]>(load, attempt);
  return (
    <View className="gap-2">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {t.eventsRegistrants}
      </Text>
      {loaded.state === "failed" ? (
        <ErrorState message={t.eventsLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={2} />
      ) : loaded.value.length === 0 ? (
        <Text className="font-figtree text-sm text-ink-2">{t.eventsNoRegistrants}</Text>
      ) : (
        <View className="rounded-card border border-line bg-surface">
          {loaded.value.map((r, i) => (
            <LinkButton
              key={r.memberId}
              href={`/profile/${r.memberId}`}
              label={r.fullName ?? ""}
              className={`min-h-[52px] justify-center gap-0.5 px-4 py-2 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <Text className="font-figtree-semibold text-[15px] text-ink">
                {r.fullName}
                {r.status === "waitlisted"
                  ? ` · ${t.eventsWaitlistLabel} ${r.waitlistPosition}`
                  : ""}
              </Text>
              {r.headline ? (
                <Text className="font-figtree text-[13px] text-ink-2">{r.headline}</Text>
              ) : null}
            </LinkButton>
          ))}
        </View>
      )}
    </View>
  );
}

/** S38: one event, with Register or the waitlist, Add to calendar, and the poster's registrant list. */
export function EventDetail({ api, eventId }: { api: EventsApi; eventId: string }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const loaded = useLoad(
    () => api.feed().then((all) => all.find((e) => e.id === eventId) ?? null),
    attempt,
  );

  const lookAct = useAct();
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      setAttempt((a) => a + 1);
    } catch {
      setProblem(t.eventsActionFailed);
    }
    setBusy(false);
  };

  if (loaded.state === "failed") {
    return <ErrorState message={t.eventsLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  const event = loaded.value;
  if (!event) {
    return (
      <EmptyState
        title={t.eventsNotFound}
        message=""
        action={{ label: t.eventsBack, href: "/events" }}
      />
    );
  }
  const full = event.registered >= event.capacity;
  const published = event.status === "published";
  const started = new Date(event.startsAt).getTime() <= Date.now();

  return (
    <View className="gap-4">
      <ScreenTitle>{event.title}</ScreenTitle>
      <View className="gap-1">
        <Text className="font-figtree-semibold text-[15px] text-ink">
          {formatDateTime(new Date(event.startsAt), language)}
        </Text>
        <Text className="font-figtree text-[15px] text-ink">{whereLine(t, event)}</Text>
        <StatusLine event={event} />
      </View>
      {event.details ? (
        <Text className="font-figtree text-[15px] leading-6 text-ink">{event.details}</Text>
      ) : null}
      <Message text={problem} />

      {published && !started ? (
        <View className="gap-2">
          {event.myStatus === null ? (
            <Button
              label={full ? t.eventsJoinWaitlist : t.eventsRegister}
              disabled={busy}
              onPress={() => lookAct("register", () => act(() => api.register(event.id)))}
            />
          ) : (
            <Button
              secondary
              label={event.myStatus === "registered" ? t.eventsCancel : t.eventsLeaveWaitlist}
              disabled={busy}
              onPress={() => act(() => api.cancel(event.id))}
            />
          )}
          {event.link && event.myStatus === "registered" ? (
            <Button
              secondary
              label={t.eventsOpenLink}
              onPress={() => Linking.openURL(event.link!)}
            />
          ) : null}
          <Button
            secondary
            label={t.eventsAddToCalendar}
            onPress={() =>
              Linking.openURL(
                calendarLink({
                  title: event.title,
                  startsAt: event.startsAt,
                  venue: event.venue,
                  link: event.myStatus === "registered" ? event.link : null,
                  details: event.details,
                }),
              )
            }
          />
        </View>
      ) : null}

      {event.isMine && event.status === "draft" ? (
        <LinkButton
          href={`/events/new?id=${event.id}`}
          label={t.eventsEdit}
          className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
        >
          <Text className="font-figtree-semibold text-sm text-ink-2">{t.eventsEdit}</Text>
        </LinkButton>
      ) : null}
      {event.isMine && published ? <Registrants load={() => api.registrants(event.id)} /> : null}
    </View>
  );
}

const problemText = (t: Strings, problem: EventProblem | "contact_details"): string =>
  ({
    title: t.eventProblemTitle,
    start: t.eventProblemStart,
    venue_or_link: t.eventProblemVenue,
    link: t.eventProblemLink,
    capacity: t.eventProblemCapacity,
    details: t.eventProblemDetails,
    contact_details: t.eventProblemContact,
  })[problem];

const fromServer: Record<string, EventProblem | "contact_details"> = {
  invalid_title: "title",
  invalid_details: "details",
  invalid_start: "start",
  venue_or_link_required: "venue_or_link",
  invalid_venue: "venue_or_link",
  invalid_link: "link",
  invalid_capacity: "capacity",
  contact_details: "contact_details",
};

const blankDraft: EventDraft = {
  title: "",
  details: "",
  date: "",
  time: "",
  venue: "",
  link: "",
  capacity: "",
};

function draftFrom(event: EventItem): EventDraft {
  const local = new Date(new Date(event.startsAt).getTime() + 3 * 60 * 60 * 1000).toISOString();
  return {
    title: event.title,
    details: event.details ?? "",
    date: local.slice(0, 10),
    time: local.slice(11, 16),
    venue: event.venue ?? "",
    link: event.link ?? "",
    capacity: String(event.capacity),
  };
}

/** S38: post an event, or edit a draft one (Level 2 and up). */
export function EventForm({ api, eventId }: { api: EventsApi; eventId: string | null }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const canPost = await api.canPost();
    if (!eventId) return { canPost, draft: blankDraft };
    const existing = (await api.feed()).find(
      (e) => e.id === eventId && e.isMine && e.status === "draft",
    );
    return { canPost, draft: existing ? draftFrom(existing) : null };
  }, attempt);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loaded.state === "ready" && loaded.value.draft && draft === null)
      setDraft(loaded.value.draft);
  }, [loaded, draft]);

  if (loaded.state === "failed") {
    return <ErrorState message={t.eventsLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  if (!loaded.value.canPost) {
    return (
      <LockedState
        screenName={t.eventsPost}
        reason={t.eventsLockedReason}
        action={{ label: t.eventsLockedAction, href: "/business" }}
      />
    );
  }
  if (!loaded.value.draft) {
    return (
      <EmptyState
        title={t.eventsNotFound}
        message=""
        action={{ label: t.eventsBack, href: "/events" }}
      />
    );
  }
  const form = draft ?? loaded.value.draft;
  const set = (key: keyof EventDraft) => (value: string) => setDraft({ ...form, [key]: value });

  const save = async (submit: boolean) => {
    const local = checkEvent(form);
    if (local) return setProblem(problemText(t, local));
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const saved = await api.save(eventId, form, submit);
      const known = fromServer[saved.result];
      if (known) {
        setProblem(problemText(t, known));
      } else if (saved.result === "pending_review" || saved.result === "draft") {
        setNotice(saved.result === "draft" ? t.eventSaved : t.eventSent);
        if (saved.eventId) router.push(`/events/${saved.eventId}`);
      } else {
        setProblem(t.eventsActionFailed);
      }
    } catch {
      setProblem(t.saveFailed);
    }
    setBusy(false);
  };

  return (
    <View className="gap-4">
      <ScreenTitle>{eventId ? t.eventsEditTitle : t.eventsPost}</ScreenTitle>
      <Field label={t.eventTitleLabel} value={form.title} onChange={set("title")} />
      <Field
        label={t.eventDateLabel}
        hint={t.eventDateHint}
        value={form.date}
        onChange={set("date")}
      />
      <Field
        label={t.eventTimeLabel}
        hint={t.eventTimeHint}
        value={form.time}
        onChange={set("time")}
      />
      <Field
        label={t.eventVenueLabel}
        hint={t.eventVenueHint}
        value={form.venue}
        onChange={set("venue")}
      />
      <Field
        label={t.eventLinkLabel}
        hint={t.eventLinkHint}
        value={form.link}
        onChange={set("link")}
      />
      <Field
        label={t.eventCapacityLabel}
        value={form.capacity}
        keyboardType="number-pad"
        onChange={set("capacity")}
      />
      <Field label={t.eventDetailsLabel} value={form.details} multiline onChange={set("details")} />
      <Message text={problem} />
      <Message text={notice} tone="info" />
      <Text className="font-figtree text-[13px] text-ink-2">{t.eventSubmitHint}</Text>
      <Button label={t.eventSubmit} disabled={busy} onPress={() => save(true)} />
      <Button secondary label={t.eventSaveDraft} disabled={busy} onPress={() => save(false)} />
    </View>
  );
}

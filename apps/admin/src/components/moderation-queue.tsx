"use client";

import {
  checkEvent,
  formatDateTime,
  type EventDraft,
  type EventProblem,
  type Strings,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import type { EventModerationApi, PendingEvent } from "@/lib/events";
import { useLanguage } from "@/lib/language";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import { buttonVariants } from "./ui/button";

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

const blank: EventDraft = {
  title: "",
  details: "",
  date: "",
  time: "",
  venue: "",
  link: "",
  capacity: "",
};

function AdminEventForm({ api, onDone }: { api: EventModerationApi; onDone: () => void }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(blank);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof EventDraft) => (value: string) => setForm({ ...form, [key]: value });

  const publish = async () => {
    const local = checkEvent(form);
    if (local) return setProblem(problemText(t, local));
    setBusy(true);
    setProblem(null);
    try {
      const result = await api.post(form);
      if (result === "published") return onDone();
      const known = fromServer[result];
      setProblem(known ? problemText(t, known) : t.saveFailed);
    } catch {
      setProblem(t.saveFailed);
    }
    setBusy(false);
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
      onSubmit={(e) => e.preventDefault()}
    >
      <Field
        id="event-title"
        label={t.eventTitleLabel}
        value={form.title}
        onChange={set("title")}
      />
      <Field
        id="event-date"
        label={t.eventDateLabel}
        type="date"
        value={form.date}
        onChange={set("date")}
      />
      <Field
        id="event-time"
        label={`${t.eventTimeLabel} (${t.eventTimeHint})`}
        type="time"
        value={form.time}
        onChange={set("time")}
      />
      <Field
        id="event-venue"
        label={`${t.eventVenueLabel} (${t.eventVenueHint})`}
        value={form.venue}
        onChange={set("venue")}
      />
      <Field id="event-link" label={t.eventLinkLabel} value={form.link} onChange={set("link")} />
      <Field
        id="event-capacity"
        label={t.eventCapacityLabel}
        type="number"
        value={form.capacity}
        onChange={set("capacity")}
      />
      <Field
        id="event-details"
        label={t.eventDetailsLabel}
        multiline
        value={form.details}
        onChange={set("details")}
      />
      {problem ? (
        <p role="alert" className="text-sm text-bad-text">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={publish}
          className={buttonVariants({ size: "lg" })}
        >
          {t.adminEventPublish}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDone}
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function PendingEventRow({
  item,
  api,
  onDecided,
}: {
  item: PendingEvent;
  api: EventModerationApi;
  onDecided: () => void;
}) {
  const { t, language } = useLanguage();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    if (!approve && reason.trim() === "") return setProblem(t.moderationReasonRequired);
    setBusy(true);
    setProblem(null);
    try {
      const result = await api.decide(item.id, approve, reason);
      if (result === "ok") return onDecided();
      setProblem(
        result === "already_decided"
          ? t.moderationAlreadyDecided
          : result === "reason_has_contact_details"
            ? t.eventProblemContact
            : t.saveFailed,
      );
    } catch {
      setProblem(t.saveFailed);
    }
    setBusy(false);
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="text-[15px] font-semibold text-foreground">{item.title}</span>
      <span className="text-[13px] text-ink-2">
        {formatDateTime(new Date(item.startsAt), language)} · {item.venue ?? item.link} ·{" "}
        {t.eventCapacityLabel} {item.capacity}
        {item.posterUsername ? ` · ${t.moderationPostedBy(item.posterUsername)}` : ""}
      </span>
      {item.link && item.venue ? <span className="text-[13px] text-ink-2">{item.link}</span> : null}
      {item.details ? (
        <p className="whitespace-pre-line text-sm text-foreground">{item.details}</p>
      ) : null}
      {rejecting ? (
        <Field
          id={`reason-${item.id}`}
          label={t.moderationReasonLabel}
          multiline
          value={reason}
          onChange={setReason}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-bad-text">
          {problem}
        </p>
      ) : null}
      <span className="flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(false)}
              className={buttonVariants({ variant: "destructive" })}
            >
              {t.moderationSendBack}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className={buttonVariants({ variant: "ghost" })}
            >
              {t.cancel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(true)}
              className={buttonVariants()}
            >
              {t.moderationApprove}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className={buttonVariants({ variant: "outline" })}
            >
              {t.moderationSendBack}
            </button>
          </>
        )}
      </span>
    </li>
  );
}

/** A04: the moderation queue. Events from T03; opportunities, ideas and training join with their tickets. */
export function ModerationQueue({ events }: { events: EventModerationApi }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<PendingEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    events.queue().then(
      (loaded) => live && setItems(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [events, attempt]);

  const reload = () => {
    setFailed(false);
    setItems(null);
    setAttempt((a) => a + 1);
  };

  return (
    <>
      <ScreenTitle>{t.adminNavModeration}</ScreenTitle>
      <div className="flex flex-col gap-4">
        {posting ? (
          <AdminEventForm
            api={events}
            onDone={() => {
              setPosting(false);
              setNotice(t.adminEventPublished);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setPosting(true);
            }}
            className={`${buttonVariants({ variant: "outline", size: "lg" })} self-start`}
          >
            {t.adminEventPost}
          </button>
        )}
        {notice ? (
          <p role="status" className="text-sm text-foreground">
            {notice}
          </p>
        ) : null}
        {failed ? (
          <ErrorState message={t.eventsLoadFailed} onRetry={reload} />
        ) : !items ? (
          <LoadingRows />
        ) : items.length === 0 ? (
          <EmptyState title={t.moderationEmptyTitle} message={t.moderationEmptyMessage} />
        ) : (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">{t.moderationEventsTitle}</h2>
            <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
              {items.map((item) => (
                <PendingEventRow key={item.id} item={item} api={events} onDecided={reload} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

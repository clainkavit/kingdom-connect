"use client";

import {
  checkEvent,
  checkTraining,
  formatDateTime,
  type EventDraft,
  type EventProblem,
  type Strings,
  type TrainingDraft,
  type TrainingFormat,
  type TrainingProblem,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import type { EventModerationApi, PendingEvent } from "@/lib/events";
import type { PendingTraining, TrainingModerationApi } from "@/lib/training";
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

const trainingProblemText = (t: Strings, problem: TrainingProblem | "contact_details"): string =>
  ({
    title: t.eventProblemTitle,
    provider: t.trainingProblemProvider,
    venue: t.trainingProblemVenue,
    start: t.eventProblemStart,
    seats: t.trainingProblemSeats,
    details: t.eventProblemDetails,
    contact_details: t.eventProblemContact,
  })[problem];

const trainingFromServer: Record<string, TrainingProblem | "contact_details"> = {
  invalid_title: "title",
  invalid_provider: "provider",
  invalid_details: "details",
  invalid_venue: "venue",
  invalid_start: "start",
  invalid_seats: "seats",
  contact_details: "contact_details",
};

const blankTraining: TrainingDraft = {
  title: "",
  provider: "",
  format: "in_person",
  details: "",
  venue: "",
  selfPaced: false,
  date: "",
  time: "",
  seats: "",
  downloadsAllowed: false,
};

function AdminTrainingForm({ api, onDone }: { api: TrainingModerationApi; onDone: () => void }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(blankTraining);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (key: "title" | "provider" | "details" | "venue" | "date" | "time" | "seats") =>
    (value: string) =>
      setForm({ ...form, [key]: value });

  const publish = async () => {
    const local = checkTraining(form);
    if (local) return setProblem(trainingProblemText(t, local));
    setBusy(true);
    setProblem(null);
    try {
      const result = await api.post(form);
      if (result === "published") return onDone();
      const known = trainingFromServer[result];
      setProblem(known ? trainingProblemText(t, known) : t.saveFailed);
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
        id="training-title"
        label={t.eventTitleLabel}
        value={form.title}
        onChange={set("title")}
      />
      <Field
        id="training-provider"
        label={t.trainingProviderLabel}
        value={form.provider}
        onChange={set("provider")}
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-semibold text-foreground">{t.trainingFormatLabel}</legend>
        <span className="flex gap-4">
          {(["in_person", "online"] as TrainingFormat[]).map((format) => (
            <label
              key={format}
              className="flex min-h-[44px] items-center gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name="training-format"
                checked={form.format === format}
                onChange={() => setForm({ ...form, format })}
              />
              {format === "online" ? t.trainingOnline : t.trainingInPerson}
            </label>
          ))}
        </span>
      </fieldset>
      {form.format === "in_person" ? (
        <Field
          id="training-venue"
          label={t.eventVenueLabel}
          value={form.venue}
          onChange={set("venue")}
        />
      ) : null}
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.selfPaced}
          onChange={(e) => setForm({ ...form, selfPaced: e.target.checked })}
          className="size-4"
        />
        {t.trainingSelfPacedLabel}
      </label>
      {form.selfPaced ? null : (
        <>
          <Field
            id="training-date"
            label={t.eventDateLabel}
            type="date"
            value={form.date}
            onChange={set("date")}
          />
          <Field
            id="training-time"
            label={`${t.eventTimeLabel} (${t.eventTimeHint})`}
            type="time"
            value={form.time}
            onChange={set("time")}
          />
        </>
      )}
      <Field
        id="training-seats"
        label={t.trainingSeatsLabel}
        type="number"
        value={form.seats}
        onChange={set("seats")}
      />
      <Field
        id="training-details"
        label={t.eventDetailsLabel}
        multiline
        value={form.details}
        onChange={set("details")}
      />
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.downloadsAllowed}
          onChange={(e) => setForm({ ...form, downloadsAllowed: e.target.checked })}
          className="size-4"
        />
        {t.trainingDownloadsLabel}
      </label>
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

function PendingRow({
  id,
  title,
  meta,
  details,
  decide,
  onDecided,
}: {
  id: string;
  title: string;
  meta: string;
  details: string | null;
  decide: (approve: boolean, reason: string) => Promise<string>;
  onDecided: () => void;
}) {
  const { t } = useLanguage();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const answer = async (approve: boolean) => {
    if (!approve && reason.trim() === "") return setProblem(t.moderationReasonRequired);
    setBusy(true);
    setProblem(null);
    try {
      const result = await decide(approve, reason);
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
      <span className="text-[15px] font-semibold text-foreground">{title}</span>
      <span className="text-[13px] text-ink-2">{meta}</span>
      {details ? <p className="whitespace-pre-line text-sm text-foreground">{details}</p> : null}
      {rejecting ? (
        <Field
          id={`reason-${id}`}
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
              onClick={() => answer(false)}
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
              onClick={() => answer(true)}
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

type Queue = { events: PendingEvent[]; training: PendingTraining[] };

/** A04: the moderation queue. Events (T03) and training (T01); opportunities and ideas join with their tickets. */
export function ModerationQueue({
  events,
  training,
}: {
  events: EventModerationApi;
  training: TrainingModerationApi;
}) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<Queue | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [posting, setPosting] = useState<"event" | "training" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([events.queue(), training.queue()]).then(
      ([e, tr]) => live && setItems({ events: e, training: tr }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [events, training, attempt]);

  const reload = () => {
    setFailed(false);
    setItems(null);
    setAttempt((a) => a + 1);
  };
  const posted = () => {
    setPosting(null);
    setNotice(t.adminEventPublished);
  };
  const by = (username: string | null) => (username ? ` · ${t.moderationPostedBy(username)}` : "");

  return (
    <>
      <ScreenTitle>{t.adminNavModeration}</ScreenTitle>
      <div className="flex flex-col gap-4">
        {posting === "event" ? (
          <AdminEventForm api={events} onDone={posted} />
        ) : posting === "training" ? (
          <AdminTrainingForm api={training} onDone={posted} />
        ) : (
          <span className="flex flex-wrap gap-2">
            {(["event", "training"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setNotice(null);
                  setPosting(kind);
                }}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {kind === "event" ? t.adminEventPost : t.adminTrainingPost}
              </button>
            ))}
          </span>
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
        ) : items.events.length === 0 && items.training.length === 0 ? (
          <EmptyState title={t.moderationEmptyTitle} message={t.moderationEmptyMessage} />
        ) : (
          <>
            {items.training.length ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-foreground">
                  {t.moderationTrainingTitle}
                </h2>
                <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
                  {items.training.map((item) => (
                    <PendingRow
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      meta={`${t.trainingBy(item.provider)} · ${
                        item.startsAt
                          ? formatDateTime(new Date(item.startsAt), language)
                          : t.trainingSelfPaced
                      } · ${item.format === "online" ? t.trainingOnline : (item.venue ?? t.trainingInPerson)} · ${
                        t.trainingSeatsLabel
                      } ${item.seats}${by(item.posterUsername)}`}
                      details={item.details}
                      decide={(approve, reason) => training.decide(item.id, approve, reason)}
                      onDecided={reload}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {items.events.length ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-foreground">{t.moderationEventsTitle}</h2>
                <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
                  {items.events.map((item) => (
                    <PendingRow
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      meta={`${formatDateTime(new Date(item.startsAt), language)} · ${[
                        item.venue,
                        item.link,
                      ]
                        .filter(Boolean)
                        .join(
                          " · ",
                        )} · ${t.eventCapacityLabel} ${item.capacity}${by(item.posterUsername)}`}
                      details={item.details}
                      decide={(approve, reason) => events.decide(item.id, approve, reason)}
                      onDecided={reload}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

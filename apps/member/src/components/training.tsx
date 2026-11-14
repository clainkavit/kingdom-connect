import {
  checkTraining,
  formatDateTime,
  type Strings,
  type TrainingDraft,
  type TrainingFormat,
  type TrainingProblem,
} from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { MaterialsApi } from "../lib/materials";
import type { TrainingApi, TrainingItem } from "../lib/training";
import { Registrants, useLoad } from "./events";
import { Button, Checkbox, Chips, Field, Message } from "./form";
import { Materials } from "./materials";
import { LinkButton } from "./link-button";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows, LockedState } from "./states";
import { useAct } from "./look";

function whenLine(t: Strings, item: TrainingItem, language: "en" | "sw"): string {
  const when = item.startsAt
    ? formatDateTime(new Date(item.startsAt), language)
    : t.trainingSelfPaced;
  const how = item.format === "online" ? t.trainingOnline : (item.venue ?? t.trainingInPerson);
  return `${when} · ${how}`;
}

function StatusLine({ item }: { item: TrainingItem }) {
  const { t } = useLanguage();
  if (item.status === "pending_review") {
    return (
      <Text className="font-figtree-semibold text-[13px] text-warn-text">
        {t.eventsStatusPending}
      </Text>
    );
  }
  if (item.status === "draft") {
    return (
      <Text className="font-figtree-semibold text-[13px] text-ink-2">
        {item.reviewReason ? t.eventsReviewReason(item.reviewReason) : t.eventsStatusDraft}
      </Text>
    );
  }
  if (item.myStatus === "registered") {
    return (
      <Text className="font-figtree-semibold text-[13px] text-good-text">
        {t.trainingRegistered}
      </Text>
    );
  }
  if (item.myStatus === "waitlisted" && item.myWaitlistPosition) {
    return (
      <Text className="font-figtree-semibold text-[13px] text-warn-text">
        {t.eventsWaitlisted(item.myWaitlistPosition)}
      </Text>
    );
  }
  const left = Math.max(item.seats - item.registered, 0);
  return (
    <Text className="font-figtree text-[13px] text-ink-2">
      {left > 0 ? t.trainingSeatsLeft(left, item.seats) : t.trainingFull}
    </Text>
  );
}

/** S35: training from the community, and the member's own drafts and training waiting for review (T01). */
export function TrainingList({ api }: { api: TrainingApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    () => Promise.all([api.feed(), api.canPost()]).then(([items, canPost]) => ({ items, canPost })),
    attempt,
  );

  return (
    <View>
      <ScreenTitle>{t.navTraining}</ScreenTitle>
      {loaded.state === "failed" ? (
        <ErrorState message={t.trainingLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : (
        <View className="gap-3">
          {loaded.value.canPost ? (
            <LinkButton
              href="/training/new"
              label={t.trainingPost}
              className="min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4"
            >
              <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.trainingPost}</Text>
            </LinkButton>
          ) : (
            <Text className="font-figtree text-sm text-ink-2">{t.trainingPausedReason}</Text>
          )}
          {loaded.value.items.length === 0 ? (
            <EmptyState title={t.trainingEmptyTitle} message={t.trainingEmptyMessage} />
          ) : (
            loaded.value.items.map((item) => (
              <LinkButton
                key={item.id}
                href={`/training/${item.id}`}
                label={item.title}
                className="gap-1 rounded-card border border-line bg-surface p-4"
              >
                <Text className="font-figtree-bold text-[16px] text-ink">{item.title}</Text>
                <Text className="font-figtree text-[14px] text-ink">
                  {t.trainingBy(item.provider)}
                </Text>
                <Text className="font-figtree text-[14px] text-ink">
                  {whenLine(t, item, language)}
                </Text>
                <StatusLine item={item} />
              </LinkButton>
            ))
          )}
        </View>
      )}
    </View>
  );
}

/** S35: one training, with Register or the waitlist, and the poster's registrant list. */
export function TrainingDetail({
  api,
  materials,
  trainingId,
}: {
  api: TrainingApi;
  materials: MaterialsApi;
  trainingId: string;
}) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const loaded = useLoad(
    () => api.feed().then((all) => all.find((i) => i.id === trainingId) ?? null),
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
    return <ErrorState message={t.trainingLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  const item = loaded.value;
  if (!item) {
    return (
      <EmptyState
        title={t.trainingNotFound}
        message=""
        action={{ label: t.trainingBack, href: "/training" }}
      />
    );
  }
  const full = item.registered >= item.seats;
  const published = item.status === "published";
  const started = item.startsAt !== null && new Date(item.startsAt).getTime() <= Date.now();

  return (
    <View className="gap-4">
      <ScreenTitle>{item.title}</ScreenTitle>
      <View className="gap-1">
        <Text className="font-figtree-semibold text-[15px] text-ink">
          {t.trainingBy(item.provider)}
        </Text>
        <Text className="font-figtree text-[15px] text-ink">{whenLine(t, item, language)}</Text>
        <StatusLine item={item} />
      </View>
      {item.details ? (
        <Text className="font-figtree text-[15px] leading-6 text-ink">{item.details}</Text>
      ) : null}
      <Message text={problem} />

      {published && !started ? (
        item.myStatus === null ? (
          <Button
            label={full ? t.eventsJoinWaitlist : t.eventsRegister}
            disabled={busy}
            onPress={() => lookAct("register", () => act(() => api.register(item.id)))}
          />
        ) : (
          <Button
            secondary
            label={item.myStatus === "registered" ? t.trainingCancel : t.eventsLeaveWaitlist}
            disabled={busy}
            onPress={() => act(() => api.cancel(item.id))}
          />
        )
      ) : null}
      {published || item.isMine ? (
        <Materials
          key={`${item.id}-${item.myStatus}`}
          api={materials}
          trainingId={item.id}
          canOpen={item.isMine || item.myStatus === "registered"}
          downloadsAllowed={item.downloadsAllowed}
        />
      ) : null}

      {item.isMine && item.status === "draft" ? (
        <LinkButton
          href={`/training/new?id=${item.id}`}
          label={t.eventsEdit}
          className="min-h-[44px] items-center justify-center rounded-[9px] border border-line bg-surface px-4"
        >
          <Text className="font-figtree-semibold text-sm text-ink-2">{t.eventsEdit}</Text>
        </LinkButton>
      ) : null}
      {item.isMine && published ? <Registrants load={() => api.registrants(item.id)} /> : null}
    </View>
  );
}

const problemText = (t: Strings, problem: TrainingProblem | "contact_details"): string =>
  ({
    title: t.eventProblemTitle,
    provider: t.trainingProblemProvider,
    venue: t.trainingProblemVenue,
    start: t.eventProblemStart,
    seats: t.trainingProblemSeats,
    details: t.eventProblemDetails,
    contact_details: t.eventProblemContact,
  })[problem];

const fromServer: Record<string, TrainingProblem | "contact_details"> = {
  invalid_title: "title",
  invalid_provider: "provider",
  invalid_details: "details",
  invalid_venue: "venue",
  invalid_start: "start",
  invalid_seats: "seats",
  contact_details: "contact_details",
};

const blankDraft: TrainingDraft = {
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

function draftFrom(item: TrainingItem): TrainingDraft {
  const local = item.startsAt
    ? new Date(new Date(item.startsAt).getTime() + 3 * 60 * 60 * 1000).toISOString()
    : "";
  return {
    title: item.title,
    provider: item.provider,
    format: item.format,
    details: item.details ?? "",
    venue: item.venue ?? "",
    selfPaced: item.startsAt === null,
    date: local.slice(0, 10),
    time: local.slice(11, 16),
    seats: String(item.seats),
    downloadsAllowed: item.downloadsAllowed,
  };
}

/** S37: post a training, or edit a draft one. Any verified member; staff review it before it is live. */
export function TrainingForm({ api, trainingId }: { api: TrainingApi; trainingId: string | null }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const canPost = await api.canPost();
    if (!trainingId) return { canPost, draft: blankDraft };
    const existing = (await api.feed()).find(
      (i) => i.id === trainingId && i.isMine && i.status === "draft",
    );
    return { canPost, draft: existing ? draftFrom(existing) : null };
  }, attempt);
  const [draft, setDraft] = useState<TrainingDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loaded.state === "ready" && loaded.value.draft && draft === null)
      setDraft(loaded.value.draft);
  }, [loaded, draft]);

  if (loaded.state === "failed") {
    return <ErrorState message={t.trainingLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows />;
  if (!loaded.value.canPost) {
    return (
      <LockedState
        screenName={t.trainingPost}
        reason={t.trainingPausedReason}
        action={{ label: t.trainingBack, href: "/training" }}
      />
    );
  }
  if (!loaded.value.draft) {
    return (
      <EmptyState
        title={t.trainingNotFound}
        message=""
        action={{ label: t.trainingBack, href: "/training" }}
      />
    );
  }
  const form = draft ?? loaded.value.draft;
  const set =
    (key: "title" | "provider" | "details" | "venue" | "date" | "time" | "seats") =>
    (value: string) =>
      setDraft({ ...form, [key]: value });

  const save = async (submit: boolean) => {
    const local = checkTraining(form);
    if (local) return setProblem(problemText(t, local));
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const saved = await api.save(trainingId, form, submit);
      const known = fromServer[saved.result];
      if (known) {
        setProblem(problemText(t, known));
      } else if (saved.result === "pending_review" || saved.result === "draft") {
        setNotice(saved.result === "draft" ? t.eventSaved : t.eventSent);
        if (saved.trainingId) router.push(`/training/${saved.trainingId}`);
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
      <ScreenTitle>{trainingId ? t.trainingEditTitle : t.trainingPost}</ScreenTitle>
      <Field label={t.eventTitleLabel} value={form.title} onChange={set("title")} />
      <Field
        label={t.trainingProviderLabel}
        hint={t.trainingProviderHint}
        value={form.provider}
        onChange={set("provider")}
      />
      <Chips<TrainingFormat>
        label={t.trainingFormatLabel}
        options={[
          { value: "in_person", label: t.trainingInPerson },
          { value: "online", label: t.trainingOnline },
        ]}
        value={form.format}
        onChange={(format) => setDraft({ ...form, format })}
      />
      {form.format === "in_person" ? (
        <Field label={t.eventVenueLabel} value={form.venue} onChange={set("venue")} />
      ) : null}
      <Checkbox
        label={t.trainingSelfPacedLabel}
        checked={form.selfPaced}
        onChange={(selfPaced) => setDraft({ ...form, selfPaced })}
      />
      {form.selfPaced ? null : (
        <>
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
        </>
      )}
      <Field
        label={t.trainingSeatsLabel}
        value={form.seats}
        keyboardType="number-pad"
        onChange={set("seats")}
      />
      <Field label={t.eventDetailsLabel} value={form.details} multiline onChange={set("details")} />
      <Checkbox
        label={t.trainingDownloadsLabel}
        checked={form.downloadsAllowed}
        onChange={(downloadsAllowed) => setDraft({ ...form, downloadsAllowed })}
      />
      <Message text={problem} />
      <Message text={notice} tone="info" />
      <Text className="font-figtree text-[13px] text-ink-2">{t.trainingSubmitHint}</Text>
      <Button label={t.eventSubmit} disabled={busy} onPress={() => save(true)} />
      <Button secondary label={t.eventSaveDraft} disabled={busy} onPress={() => save(false)} />
    </View>
  );
}

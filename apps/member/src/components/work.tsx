import { formatDate } from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import {
  daysLeft,
  workStage,
  type Engagement,
  type RateResult,
  type Scores,
  type WorkApi,
  type WorkReference,
} from "../lib/work";
import { useLoad } from "./events";
import { Button, Chips, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const COMMENT_MAX = 500;
const REPLY_MAX = 300;

function Muted({ text }: { text: string }) {
  return <Text className="font-figtree text-sm leading-5 text-ink-2">{text}</Text>;
}

function Body({ text }: { text: string }) {
  return <Text className="font-figtree text-[15px] leading-[22px] text-ink">{text}</Text>;
}

/** S52: the worker says whether the work happened. */
function ConfirmWork({
  api,
  work,
  onDone,
}: {
  api: WorkApi;
  work: Engagement;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const answer = async (yes: boolean) => {
    setBusy(true);
    const ok = await api.confirm(work.id, yes).catch(() => false);
    setBusy(false);
    if (ok) onDone();
    else setProblem(t.workFailed);
  };
  return (
    <View className="gap-2">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {t.workConfirmTitle}
      </Text>
      <Body text={t.workConfirmMarked(work.otherName, work.title)} />
      <Muted text={t.workConfirmYesMeans} />
      <Muted text={t.workConfirmNoMeans} />
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        <Button label={t.workConfirmYes} disabled={busy} onPress={() => answer(true)} />
        <Button secondary label={t.workConfirmNo} disabled={busy} onPress={() => answer(false)} />
      </View>
      <Muted text={t.workConfirmPrivate} />
    </View>
  );
}

function WorkRow({
  api,
  work,
  onChanged,
}: {
  api: WorkApi;
  work: Engagement;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const stage = workStage(work);
  return (
    <View className="gap-2 rounded-card border border-line bg-surface px-5 py-[18px]">
      <Text className="font-figtree-bold text-[16px] text-ink">{work.title}</Text>
      <Muted
        text={
          work.role === "poster" ? t.workYouHired(work.otherName) : t.workHiredYou(work.otherName)
        }
      />
      {stage === "confirm" ? <ConfirmWork api={api} work={work} onDone={onChanged} /> : null}
      {stage === "waiting" ? <Muted text={t.workWaiting(work.otherName)} /> : null}
      {stage === "denied" ? <Muted text={t.workDenied} /> : null}
      {stage === "sent" ? <Muted text={t.workSent} /> : null}
      {stage === "closed" ? <Muted text={t.workClosed} /> : null}
      {stage === "rate" ? (
        <View className="items-start gap-2">
          <Muted text={t.workDaysLeft(daysLeft(work))} />
          <LinkButton
            href={`/work/${work.id}`}
            label={t.workRate}
            className="min-h-[44px] justify-center rounded-full bg-blue px-4"
          >
            <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.workRate}</Text>
          </LinkButton>
        </View>
      ) : null}
    </View>
  );
}

/** /work: confirmed and unconfirmed work, opened from O11, O12 and O13. */
export function MyWork({ api }: { api: WorkApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.engagements(), attempt);
  return (
    <View className="gap-3">
      <ScreenTitle>{t.workTitle}</ScreenTitle>
      <Muted text={t.workIntro} />
      {loaded.state === "failed" ? (
        <ErrorState message={t.workLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.workEmpty} message={t.workEmptyHint} />
      ) : (
        loaded.value.map((w) => (
          <WorkRow key={w.id} api={api} work={w} onChanged={() => setAttempt((a) => a + 1)} />
        ))
      )}
    </View>
  );
}

const SCORE_OPTIONS = ["1", "2", "3", "4", "5"] as const;
type Score = (typeof SCORE_OPTIONS)[number];

function rateProblem(t: ReturnType<typeof useLanguage>["t"], result: Exclude<RateResult, "ok">) {
  return {
    not_confirmed: t.workClosed,
    closed: t.workClosed,
    already_rated: t.workSent,
    contact_details: t.workContactDetails,
    invalid: t.workFailed,
    failed: t.workFailed,
  }[result];
}

function RateForm({ api, work, onSent }: { api: WorkApi; work: Engagement; onSent: () => void }) {
  const { t } = useLanguage();
  const [scores, setScores] = useState<Partial<Record<keyof Scores, Score>>>({});
  const [again, setAgain] = useState<"yes" | "no" | undefined>(undefined);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const questions: [keyof Scores, string][] = [
    ["onTime", t.rateOnTime],
    ["quality", t.rateQuality],
    ["communication", t.rateCommunication],
    ["honesty", t.rateHonesty],
  ];
  const complete = questions.every(([key]) => scores[key]) && again !== undefined;
  const send = async () => {
    if (!complete) return setProblem(t.rateIncomplete);
    if (comment.length > COMMENT_MAX || note.length > COMMENT_MAX)
      return setProblem(t.rateTooLong(COMMENT_MAX));
    setBusy(true);
    const result = await api
      .rate(
        work.id,
        {
          onTime: Number(scores.onTime),
          quality: Number(scores.quality),
          communication: Number(scores.communication),
          honesty: Number(scores.honesty),
        },
        again === "yes",
        comment.trim(),
        note.trim(),
      )
      .catch((): RateResult => "failed");
    setBusy(false);
    if (result === "ok") onSent();
    else setProblem(rateProblem(t, result));
  };
  return (
    <View className="gap-4">
      <Message tone="info" text={t.rateHidden(work.otherName, daysLeft(work))} />
      {questions.map(([key, label]) => (
        <Chips<Score>
          key={key}
          label={label}
          options={SCORE_OPTIONS.map((v) => ({ value: v, label: v }))}
          value={scores[key]}
          onChange={(v) => setScores((s) => ({ ...s, [key]: v }))}
        />
      ))}
      <Chips<"yes" | "no">
        label={t.rateAgain(work.otherName)}
        options={[
          { value: "yes", label: t.yes },
          { value: "no", label: t.no },
        ]}
        value={again}
        onChange={setAgain}
      />
      <Field
        label={t.rateComment}
        hint={t.rateCommentHint(work.otherName)}
        value={comment}
        onChange={setComment}
        multiline
      />
      <Field
        label={t.rateNote}
        privacy={t.rateNoteHint(work.otherName)}
        value={note}
        onChange={setNote}
        multiline
      />
      <Message text={problem} />
      <View className="items-start">
        <Button label={t.rateSend} disabled={busy} onPress={send} />
      </View>
      <Muted text={t.rateRules} />
    </View>
  );
}

/** S53: rate confirmed work once, hidden until both rate or the 14 days end. */
export function RateWork({ api, engagementId }: { api: WorkApi; engagementId: string }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.engagements(), attempt);
  const back = (
    <LinkButton href="/work" label={t.workTitle} className="min-h-[40px] justify-center">
      <Text className="font-figtree-semibold text-sm text-blue">{t.workTitle}</Text>
    </LinkButton>
  );
  if (loaded.state === "failed")
    return <ErrorState message={t.workLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  if (loaded.state === "loading") return <LoadingRows />;
  const work = loaded.value.find((w) => w.id === engagementId);
  if (!work) return <EmptyState title={t.workNotFound} message={t.workEmptyHint} />;
  const stage = workStage(work);
  return (
    <View className="gap-3">
      {back}
      <ScreenTitle>{t.rateTitle(work.otherName)}</ScreenTitle>
      <Muted
        text={
          work.role === "poster" ? t.workYouHired(work.otherName) : t.workHiredYou(work.otherName)
        }
      />
      <Body text={work.title} />
      {stage === "rate" ? (
        <RateForm api={api} work={work} onSent={() => setAttempt((a) => a + 1)} />
      ) : stage === "confirm" ? (
        <ConfirmWork api={api} work={work} onDone={() => setAttempt((a) => a + 1)} />
      ) : (
        <Message
          tone="info"
          text={
            stage === "sent"
              ? t.workSent
              : stage === "waiting"
                ? t.workWaiting(work.otherName)
                : stage === "denied"
                  ? t.workDenied
                  : t.workClosed
          }
        />
      )}
    </View>
  );
}

function ReplyBox({
  api,
  item,
  onDone,
}: {
  api: WorkApi;
  item: WorkReference;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <View className="items-start">
        <Button secondary label={t.refReply} onPress={() => setOpen(true)} />
      </View>
    );
  const send = async () => {
    const clean = text.trim();
    if (!clean) return setProblem(t.refReplyEmpty);
    if (clean.length > REPLY_MAX) return setProblem(t.rateTooLong(REPLY_MAX));
    setBusy(true);
    const result = await api.reply(item.id, clean).catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") onDone();
    else setProblem(result === "contact_details" ? t.workContactDetails : t.workFailed);
  };
  return (
    <View className="gap-2">
      <Field label={t.refReply} hint={t.refReplyHint} value={text} onChange={setText} multiline />
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        <Button label={t.refReplySend} disabled={busy} onPress={send} />
        <Button secondary label={t.cancel} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

/** S11 Work references: absent below 3 revealed ratings; the owner sees a note instead. */
export function ProfileReferences({
  api,
  memberId,
  name,
  own,
}: {
  api: WorkApi;
  memberId: string;
  name: string;
  own: boolean;
}) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.references(memberId), attempt);
  if (loaded.state !== "ready") return null;
  const refs = loaded.value;
  if (!refs)
    return own ? (
      <Section title={t.refTitle}>
        <Muted text={t.refOwnUnder3} />
      </Section>
    ) : null;
  const averages: [string, number][] = [
    [t.rateOnTime, refs.averages.onTime],
    [t.rateQuality, refs.averages.quality],
    [t.rateCommunication, refs.averages.communication],
    [t.rateHonesty, refs.averages.honesty],
  ];
  return (
    <Section title={t.refTitle}>
      <Muted text={t.refFromConfirmed} />
      <Text className="font-figtree-bold text-[17px] text-ink">
        {t.refAgain(refs.againCount, refs.total, name)}
      </Text>
      <View className="gap-1">
        {averages.map(([label, value]) => (
          <View key={label} className="flex-row items-center justify-between gap-3">
            <Muted text={label} />
            <Text className="font-figtree-bold text-[15px] text-ink">{value.toFixed(1)}</Text>
          </View>
        ))}
      </View>
      {refs.items.map((item) => (
        <View key={item.id} className="gap-1 border-t border-line pt-3">
          <Text className="font-figtree-semibold text-[15px] text-ink">{item.raterName}</Text>
          <Muted
            text={[item.title, formatDate(item.ratedAt, language)].filter(Boolean).join(" · ")}
          />
          {item.comment ? <Body text={item.comment} /> : null}
          {item.reply ? (
            <View className="ml-3 gap-0.5 border-l-2 border-line pl-3">
              <Muted text={t.refReplied(name)} />
              <Body text={item.reply} />
            </View>
          ) : own ? (
            <ReplyBox api={api} item={item} onDone={() => setAttempt((a) => a + 1)} />
          ) : null}
        </View>
      ))}
      <Muted text={t.refFootnote} />
    </Section>
  );
}

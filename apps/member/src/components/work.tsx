import { formatDate } from "@kingdom-connect/shared";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Star from "lucide-react-native/icons/star";
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
import { usePalette } from "./palette";
import { Section } from "./profile";
import { PageHeader, ScreenTitle } from "./screens";
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
    <View className="gap-4">
      <Text role="heading" aria-level={2} className="font-figtree-extrabold text-[24px] text-ink">
        {t.workConfirmTitle}
      </Text>
      <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
        {t.workConfirmMarkedLead(work.otherName)}{" "}
        <Text className="font-figtree-bold text-ink">{work.title}</Text>.
      </Text>
      <View className="gap-1.5 rounded-card border border-line bg-surface-2 px-5 py-4">
        {[t.workConfirmRateFor, t.workConfirmNeitherSees, t.workConfirmNoMeans].map((line) => (
          <View key={line} className="flex-row gap-2">
            <Text className="font-figtree text-[14px] text-ink">•</Text>
            <Text className="flex-1 font-figtree text-[14px] leading-[21px] text-ink">{line}</Text>
          </View>
        ))}
      </View>
      <Message text={problem} />
      <Button label={t.workConfirmYes} disabled={busy} onPress={() => answer(true)} />
      <Button secondary label={t.workConfirmNo} disabled={busy} onPress={() => answer(false)} />
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.workConfirmPrivate}</Text>
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
  const palette = usePalette();
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
      <View className="flex-row items-start gap-3 rounded-card bg-warn-soft px-5 py-4">
        <Text className="rounded-full bg-warn-text px-2.5 py-1 font-figtree-extrabold text-[11px] tracking-[0.06em] text-warn-soft">
          {t.rateHiddenChip.toUpperCase()}
        </Text>
        <Text className="flex-1 font-figtree text-[14px] leading-[21px] text-warn-text">
          {t.rateHiddenBody(work.otherName, daysLeft(work))}
        </Text>
      </View>
      <View className="rounded-card border border-line bg-surface px-5 py-1">
        {questions.map(([key, label], i) => (
          <View
            key={key}
            role="radiogroup"
            aria-label={label}
            className={`min-h-[60px] flex-row flex-wrap items-center justify-between gap-3 py-2 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <Text className="font-figtree-bold text-[15px] text-ink">{label}</Text>
            <View className="flex-row gap-1">
              {SCORE_OPTIONS.map((v) => {
                const on = Number(scores[key] ?? 0) >= Number(v);
                return (
                  <Pressable
                    key={v}
                    role="radio"
                    aria-label={v}
                    aria-checked={scores[key] === v}
                    onPress={() => setScores((s) => ({ ...s, [key]: v }))}
                    className="h-10 w-10 items-center justify-center"
                  >
                    <Star
                      size={24}
                      color={on ? palette.goldDeep : palette.line2}
                      fill={on ? palette.goldDeep : palette.line2}
                      aria-hidden
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
      <View role="radiogroup" aria-label={t.rateAgain(work.otherName)} className="gap-2">
        <Text className="font-figtree-bold text-[15px] text-ink">
          {t.rateAgain(work.otherName)}
        </Text>
        <View className="flex-row gap-3">
          {(["yes", "no"] as const).map((v) => (
            <Pressable
              key={v}
              role="radio"
              aria-label={v === "yes" ? t.yes : t.no}
              aria-checked={again === v}
              onPress={() => setAgain(v)}
              className={`min-h-[60px] flex-1 flex-row items-center gap-3 rounded-[18px] px-4 ${again === v ? "border-2 border-navy bg-surface-2" : "border border-line-2 bg-surface"}`}
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded-full border-2 ${again === v ? "border-navy" : "border-line-2"}`}
              >
                {again === v ? <View className="h-2.5 w-2.5 rounded-full bg-navy" /> : null}
              </View>
              <Text className="font-figtree-bold text-[15px] text-ink">
                {v === "yes" ? t.yes : t.no}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
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
      <Button label={t.rateSend} disabled={busy} onPress={send} />
      <Muted text={t.rateRules} />
    </View>
  );
}

/** S53: rate confirmed work once, hidden until both rate or the 14 days end. */
export function RateWork({ api, engagementId }: { api: WorkApi; engagementId: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.engagements(), attempt);
  if (loaded.state === "failed")
    return <ErrorState message={t.workLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  if (loaded.state === "loading") return <LoadingRows />;
  const work = loaded.value.find((w) => w.id === engagementId);
  if (!work) return <EmptyState title={t.workNotFound} message={t.workEmptyHint} />;
  const stage = workStage(work);
  const frame = (children: React.ReactNode) => (
    <View className="w-full max-w-[1200px] self-center">
      <View className="w-full max-w-[720px] gap-4">{children}</View>
    </View>
  );
  if (stage === "confirm")
    return frame(
      <>
        <PageHeader
          back={{ label: t.workTitle, href: "/work" }}
          title={t.workConfirmPageTitle}
          subtitle={t.workConfirmFrom(work.otherName)}
        />
        <ConfirmWork api={api} work={work} onDone={() => setAttempt((a) => a + 1)} />
      </>,
    );
  return frame(
    <>
      <PageHeader
        back={{ label: t.workTitle, href: "/work" }}
        title={t.rateTitle(work.otherName)}
      />
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-warn-soft">
          <Text className="font-figtree-extrabold text-[18px] text-navy">
            {work.otherName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]!.toUpperCase())
              .join("")}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-figtree-semibold text-[13px] text-ink-2">
            {work.role === "poster" ? t.workYouHiredLabel : t.workHiredYouLabel}
          </Text>
          <Text className="font-figtree-bold text-[18px] text-ink">{work.otherName}</Text>
          <Text className="font-figtree text-[14px] text-ink-2">{work.title}</Text>
        </View>
      </View>
      {stage === "rate" ? (
        <RateForm api={api} work={work} onSent={() => setAttempt((a) => a + 1)} />
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
    </>,
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
    <View className="gap-4 rounded-card border border-line bg-surface px-6 py-6">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-[18px] text-ink">
          {t.refTitle}
        </Text>
        <Text className="rounded-full bg-warn-soft px-2.5 py-1 font-figtree-bold text-[12px] text-warn-text">
          {t.refFromConfirmed}
        </Text>
      </View>
      <Text className="font-figtree text-[15px] text-ink-2">
        <Text className="font-figtree-extrabold text-[28px] text-ink">
          {t.refAgainCount(refs.againCount, refs.total)}
        </Text>{" "}
        {t.refAgainLine(name)}
      </Text>
      <View className="gap-2.5">
        {averages.map(([label, value]) => (
          <View key={label} className="flex-row items-center gap-4">
            <Text className="w-[200px] font-figtree text-[14px] text-ink">{label}</Text>
            <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <View
                className="h-full rounded-full bg-navy"
                style={{ width: `${(value / 5) * 100}%` }}
              />
            </View>
            <Text className="w-9 text-right font-figtree-bold text-[14px] text-ink">
              {value.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>
      {refs.items.map((item) => (
        <View key={item.id} className="gap-2 border-t border-line pt-4">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-warn-soft">
              <Text className="font-figtree-bold text-[13px] text-navy">
                {item.raterName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]!.toUpperCase())
                  .join("")}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-figtree-bold text-[15px] text-ink">{item.raterName}</Text>
              <Text className="font-figtree text-[13px] text-ink-2">
                {[item.title, formatDate(item.ratedAt, language)].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          {item.comment ? <Body text={`"${item.comment}"`} /> : null}
          {item.reply ? (
            <View className="ml-4 gap-0.5 border-l-2 border-line pl-3">
              <Text className="font-figtree text-[14px] text-ink-2">
                <Text className="font-figtree-bold text-ink">{t.refReplied(name)}</Text>{" "}
                {item.reply}
              </Text>
            </View>
          ) : own ? (
            <ReplyBox api={api} item={item} onDone={() => setAttempt((a) => a + 1)} />
          ) : null}
        </View>
      ))}
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.refFootnote}</Text>
    </View>
  );
}

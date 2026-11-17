import { formatDate } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import Check from "lucide-react-native/icons/check";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import {
  PICK_SIZES,
  type PickInvite,
  type PickPerson,
  type PickRequest,
  type PickSize,
  type PicksApi,
} from "../lib/picks";
import { useLoad } from "./events";
import { Button, Chips, ConfirmButton, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";
import { PageHeader } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

export type FindMode = { mode: "open" | "pick"; size: PickSize | undefined; note: string };
export const NOTE_MAX = 500;

function Muted({ text }: { text: string }) {
  return <Text className="font-figtree text-sm leading-5 text-ink-2">{text}</Text>;
}

function BetaChip() {
  const { t } = useLanguage();
  return (
    <View className="self-start rounded-full bg-blue-soft px-2.5 py-0.5">
      <Text className="font-figtree-bold text-xs text-navy">{t.pickBeta}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-card border border-line bg-surface px-5 py-[18px]">
      {children}
    </View>
  );
}

/** S20, the last posting step: how to find people. */
export function FindModeFields({
  value,
  onChange,
}: {
  value: FindMode;
  onChange: (v: FindMode) => void;
}) {
  const { t } = useLanguage();
  return (
    <View className="gap-3">
      <Chips<"open" | "pick">
        label={t.pickHowFind}
        options={[
          { value: "open", label: t.pickOpen },
          { value: "pick", label: t.pickLetUs },
        ]}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      <Muted text={value.mode === "open" ? t.pickOpenHint : t.pickLetUsHint} />
      {value.mode === "pick" ? (
        <>
          <BetaChip />
          <Chips<PickSize>
            label={t.pickHowMany}
            options={PICK_SIZES.map((v) => ({ value: v, label: v }))}
            value={value.size}
            onChange={(size) => onChange({ ...value, size })}
          />
          <Field
            label={t.pickNote}
            value={value.note}
            onChange={(note) => onChange({ ...value, note })}
            multiline
          />
          <Muted text={t.pickAgreeFirst} />
          <Muted text={t.pickNotListed} />
          <Muted text={t.pickFreeBeta} />
        </>
      ) : null}
    </View>
  );
}

const steps = ["pickStepApproved", "pickStepFinding", "pickStepAsking", "pickStepList"] as const;
const stepOf: Record<PickRequest["status"], number> = {
  waiting: -1,
  picking: 1,
  asking: 2,
  sent: 3,
  stopped: -1,
};

function PersonCard({
  api,
  person,
  rank,
  onChanged,
}: {
  api: PicksApi;
  person: PickPerson;
  rank: number;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const region = language === "sw" ? person.regionSw : person.regionEn;
  const mark = async (view: "connect" | "not_fit") => {
    if (await api.setView(person.id, view).catch(() => false)) onChanged();
    else setProblem(t.pickFailed);
  };
  return (
    <View className="min-w-[260px] flex-1 basis-[280px] gap-2.5 rounded-card border border-line bg-surface px-5 py-5">
      <View className="flex-row items-center gap-3">
        <Text className="font-figtree-bold text-[13px] text-ink-2">{`#${rank}`}</Text>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-warn-soft">
          <Text className="font-figtree-bold text-[15px] text-navy">
            {person.fullName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]!.toUpperCase())
              .join("")}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <LinkButton
            href={`/profile/${person.memberId}`}
            label={person.fullName}
            className="self-start"
          >
            <Text className="font-figtree-bold text-[16px] text-ink">{person.fullName}</Text>
          </LinkButton>
          {[person.headline, region].filter(Boolean).length ? (
            <Text className="font-figtree text-[13px] text-ink-2">
              {[person.headline, region].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        <Text className="rounded-full bg-good-soft px-2.5 py-0.5 font-figtree-bold text-xs text-good-text">
          {t.pickVerifiedIdentity}
        </Text>
        {person.verifiedBusiness ? (
          <Text className="rounded-full bg-good-soft px-2.5 py-0.5 font-figtree-bold text-xs text-good-text">
            {t.pickVerifiedBusiness}
          </Text>
        ) : null}
      </View>
      <View className="gap-1 rounded-[14px] bg-surface-2 px-3.5 py-3">
        <Text className="font-figtree-bold text-[11px] tracking-[0.06em] text-ink-2">
          {t.pickWhy.toUpperCase()}
        </Text>
        <Text className="font-figtree text-[14px] leading-[21px] text-ink">{person.why}</Text>
      </View>
      <Message text={problem} />
      {person.posterView === "not_fit" ? (
        <Muted text={t.pickMarkedNotFit} />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t.pickConnect}
            onPress={async () => {
              await api.setView(person.id, "connect").catch(() => false);
              router.push(`/profile/${person.memberId}?connect=1`);
            }}
          />
          <Button secondary label={t.pickNotFit} onPress={() => mark("not_fit")} />
        </View>
      )}
    </View>
  );
}

/** S50: what Kingdom Connect is doing for the post, then the list of people who said yes. */
export function PickProgress({ api, opportunityId }: { api: PicksApi; opportunityId: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const loaded = useLoad(async () => {
    const progress = await api.progress(opportunityId);
    const people = progress?.status === "sent" ? await api.list(opportunityId) : [];
    return { progress, people };
  }, attempt);
  const myPosts = { label: t.myPostsTitle, href: "/opportunities/mine" };
  const frame = (children: React.ReactNode) => (
    <View className="w-full max-w-[1200px] self-center">
      <View className="w-full max-w-[920px] gap-4">{children}</View>
    </View>
  );
  if (loaded.state === "failed")
    return <ErrorState message={t.pickLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  if (loaded.state === "loading") return <LoadingRows />;
  const { progress, people } = loaded.value;
  if (!progress) return <EmptyState title={t.pickNotFound} message={t.pickNotFoundHint} />;
  const current = stepOf[progress.status];
  const beta = (
    <View className="flex-row items-start gap-3 rounded-card bg-warn-soft px-5 py-4">
      <Text className="rounded-full bg-warn-text px-2.5 py-1 font-figtree-extrabold text-[11px] text-warn-soft">
        {t.pickBeta}
      </Text>
      <Text className="flex-1 font-figtree text-[14px] leading-[21px] text-warn-text">
        {t.pickBetaNote}
      </Text>
    </View>
  );

  if (progress.status === "sent")
    return frame(
      <>
        <PageHeader back={myPosts} title={t.pickListTitle} />
        {beta}
        <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
          {t.pickListSummary(progress.wanted, progress.agreed ?? people.length)}
        </Text>
        {(progress.agreed ?? people.length) < progress.wanted ? <Muted text={t.pickFewer} /> : null}
        <View className="flex-row items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2.5">
          <ShieldCheck size={16} color={palette.ink} aria-hidden />
          <Text className="flex-1 font-figtree text-[13px] leading-5 text-ink">
            {t.pickListPrivacy}
          </Text>
        </View>
        <View className={phone ? "gap-3" : "flex-row flex-wrap gap-3"}>
          {people.map((p, i) => (
            <PersonCard
              key={p.id}
              api={api}
              person={p}
              rank={i + 1}
              onChanged={() => setAttempt((a) => a + 1)}
            />
          ))}
        </View>
      </>,
    );

  const stepNotes = [
    t.pickStepApprovedNote,
    t.pickStepFindingNote,
    t.pickStepAskingNote,
    t.pickStepListNote,
  ];
  return frame(
    <>
      <PageHeader
        back={myPosts}
        title={progress.status === "stopped" ? t.pickStoppedTitle : t.pickPickingTitle}
      />
      {progress.status === "stopped" ? (
        <Message tone="info" text={t.pickStopped} />
      ) : (
        <>
          {beta}
          <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
            {t.pickAskedFor(progress.wanted)}
          </Text>
          <View className={phone ? "gap-4" : "flex-row items-start gap-4"}>
            <View className="min-w-0 flex-1 rounded-card border border-line bg-surface px-5 py-2">
              {progress.status === "waiting" ? (
                <View className="py-3">
                  <Muted text={t.pickWaitingApproval} />
                </View>
              ) : null}
              {steps.map((key, i) => (
                <View
                  key={key}
                  className={`flex-row items-start gap-3 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${i < current ? "bg-good" : i === current ? "bg-navy" : "border border-line-2 bg-surface"}`}
                  >
                    {i < current ? (
                      <Check size={15} color="#ffffff" aria-hidden />
                    ) : (
                      <Text
                        className={`font-figtree-bold text-[13px] ${i === current ? "text-white" : "text-ink-2"}`}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="font-figtree-bold text-[15px] text-ink">{t[key]}</Text>
                      {i === current ? (
                        <Text className="rounded-full bg-warn-soft px-2 py-0.5 font-figtree-bold text-[11px] text-warn-text">
                          {t.pickNow}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="font-figtree text-[13px] leading-5 text-ink-2">
                      {stepNotes[i]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <View className={phone ? "gap-3" : "w-[280px] gap-3"}>
              {progress.note ? (
                <View className="gap-1.5 rounded-card border border-line bg-surface px-5 py-4">
                  <Text className="font-figtree-bold text-[15px] text-ink">{t.pickYourNote}</Text>
                  <Text className="font-figtree text-[14px] leading-[21px] text-ink-2">
                    {progress.note}
                  </Text>
                </View>
              ) : null}
              <Message text={problem} />
              <ConfirmButton
                label={t.pickOpenInstead}
                question={t.pickOpenInsteadConfirm}
                confirmLabel={t.pickOpenInstead}
                onConfirm={async () => {
                  if (await api.stop(opportunityId).catch(() => false)) setAttempt((a) => a + 1);
                  else setProblem(t.pickFailed);
                }}
              />
            </View>
          </View>
        </>
      )}
    </>,
  );
}

function InviteCard({
  api,
  invite,
  onChanged,
}: {
  api: PicksApi;
  invite: PickInvite;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const open = invite.status === "asked" && invite.answerBy.getTime() > Date.now();
  const answer = async (yes: boolean) => {
    setBusy(true);
    const result = await api.answer(invite.id, yes).catch(() => "failed" as const);
    setBusy(false);
    if (result === "failed") setProblem(t.pickFailed);
    else onChanged();
  };
  return (
    <Card>
      <View className="self-start rounded-full bg-blue-soft px-2.5 py-0.5">
        <Text className="font-figtree-bold text-xs text-navy">{t.pickPickedChip}</Text>
      </View>
      <Text className="font-figtree-bold text-[17px] text-ink">{invite.title}</Text>
      <Muted text={invite.posterName} />
      <LinkButton
        href={`/opportunities/${invite.opportunityId}`}
        label={t.pickReadPost}
        className="min-h-[40px] justify-center self-start"
      >
        <Text className="font-figtree-semibold text-sm text-blue">{t.pickReadPost}</Text>
      </LinkButton>
      {open ? (
        <>
          <Text className="font-figtree-semibold text-sm text-ink">{t.pickPosterSees}</Text>
          <Muted text={t.pickPosterSeesList} />
          <Text className="font-figtree-semibold text-sm text-ink">{t.pickNeverSees}</Text>
          <Muted text={t.pickNeverSeesList} />
          <Message text={problem} />
          <View className="flex-row flex-wrap gap-2">
            <Button label={t.pickYes} disabled={busy} onPress={() => answer(true)} />
            <Button secondary label={t.pickNo} disabled={busy} onPress={() => answer(false)} />
          </View>
          <Muted text={t.pickAnswerBy(formatDate(invite.answerBy, language))} />
        </>
      ) : (
        <Message
          tone="info"
          text={
            invite.status === "agreed"
              ? t.pickAnsweredYes
              : invite.status === "declined"
                ? t.pickAnsweredNo
                : t.pickLapsed
          }
        />
      )}
    </Card>
  );
}

/** S51: You were picked, opened from O9. */
export function PickedInvites({ api }: { api: PicksApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.invites(), attempt);
  return (
    <View className="w-full max-w-[920px] gap-4">
      <PageHeader
        back={{ label: t.notificationsTitle, href: "/notifications" }}
        title={t.pickInvitesTitle}
      />
      {loaded.state === "failed" ? (
        <ErrorState message={t.pickLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.pickInvitesEmpty} message={t.pickInvitesEmptyHint} />
      ) : (
        loaded.value.map((invite) => (
          <InviteCard
            key={invite.id}
            api={api}
            invite={invite}
            onChanged={() => setAttempt((a) => a + 1)}
          />
        ))
      )}
    </View>
  );
}

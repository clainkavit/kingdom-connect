import { formatDate, type Strings, type TextKey } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { OpportunityDetail } from "../lib/opportunity-browse";
import {
  NOTE_MAX,
  RESPONSE_FILE_MAX,
  type PickedPdf,
  type PostResponse,
  type RespondResult,
  type ResponsesApi,
  type ResponseStatus,
} from "../lib/responses";
import { useLoad } from "./events";
import { Button, ConfirmButton, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { useLook } from "./look";
import { Sheet, usePhone } from "./sheet";
import { typeLabel } from "./opportunity-form";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const statusLabel: Record<ResponseStatus, TextKey> = {
  new: "respStatusNew",
  shortlisted: "respStatusShortlisted",
  declined: "respStatusDeclined",
  withdrawn: "respStatusWithdrawn",
};

const statusTone: Record<ResponseStatus, string> = {
  new: "bg-blue-soft text-info-text",
  shortlisted: "bg-good-soft text-good-text",
  declined: "bg-bad-soft text-bad-text",
  withdrawn: "bg-surface-2 text-ink-2",
};

function StatusBadge({ status }: { status: ResponseStatus }) {
  const { t } = useLanguage();
  return (
    <Text
      className={`self-start rounded-full px-2.5 py-0.5 font-figtree-bold text-[12px] ${statusTone[status]}`}
    >
      {t[statusLabel[status]] as string}
    </Text>
  );
}

function respondMessage(t: Strings, result: Exclude<RespondResult, "ok">): string {
  return {
    not_open: t.respNotOpen,
    own_post: t.respOwnPost,
    level2_required: t.respLevel2,
    already_responded: t.respAlready,
    invalid_note: t.respNoteTooLong(NOTE_MAX),
    contact_details: t.respContactDetails,
    invalid_attachment: t.respBadFile,
    failed: t.respFailed,
  }[result];
}

function ThreadButton({
  api,
  opportunityId,
  other,
}: {
  api: ResponsesApi;
  opportunityId: string;
  other?: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        secondary
        label={t.respMessage}
        onPress={async () => {
          const thread = await api.thread(opportunityId, other).catch(() => null);
          if (thread) router.push(`/messages/${thread}`);
          else setFailed(true);
        }}
      />
      <Message text={failed ? t.respThreadFailed : null} />
    </>
  );
}

/** S18 on S17: apply to a job or express interest in any other post; once responded, the status (O03). */
export function RespondPanel({ api, post }: { api: ResponsesApi; post: OpportunityDetail }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(async () => {
    const [mine, level] = await Promise.all([
      api.mine(post.id),
      post.type === "tender" ? api.level() : Promise.resolve(2),
    ]);
    return { mine, level };
  }, attempt);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<PickedPdf | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const look = useLook();
  const application = post.type === "job";

  if (look.looking)
    return (
      <Button
        label={application ? t.respApplyOpen : t.respInterestOpen}
        onPress={() => look.ask(application ? "apply" : "interest")}
      />
    );
  if (loaded.state === "failed")
    return <ErrorState message={t.respLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  if (loaded.state === "loading") return <LoadingRows rows={1} />;
  const { mine, level } = loaded.value;

  if (mine) {
    const card = (
      <View className="gap-3 rounded-card border border-line bg-surface p-4">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
          {application ? t.respYourApplication : t.respYourInterest}
        </Text>
        <StatusBadge status={mine.status} />
        <Message text={problem} />
        <View className="flex-row flex-wrap gap-2">
          {mine.status === "new" || mine.status === "shortlisted" ? (
            <ThreadButton api={api} opportunityId={post.id} />
          ) : null}
          {mine.status === "new" ? (
            <ConfirmButton
              label={t.respWithdraw}
              question={t.respWithdrawConfirm}
              confirmLabel={t.respWithdraw}
              onConfirm={async () => {
                if (await api.withdraw(mine.id).catch(() => false)) setAttempt((a) => a + 1);
                else setProblem(t.respFailed);
              }}
            />
          ) : null}
        </View>
      </View>
    );
    if (!phone) return card;
    const title = application ? t.respYourApplication : t.respYourInterest;
    return (
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-figtree-bold text-sm text-ink">{title}</Text>
          <StatusBadge status={mine.status} />
        </View>
        <Button secondary label={t.respView} onPress={() => setOpen(true)} />
        <Sheet open={open} title={title} onClose={() => setOpen(false)}>
          {card}
        </Sheet>
      </View>
    );
  }

  if (post.type === "tender" && level < 2)
    return (
      <View className="gap-2 rounded-card border border-line bg-surface p-4">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
          {t.respLevel2}
        </Text>
        <Text className="font-figtree text-sm leading-5 text-ink-2">{t.respLevel2Hint}</Text>
        <LinkButton
          href="/business"
          label={t.respVerifyBusiness}
          className="min-h-[44px] justify-center"
        >
          <Text className="font-figtree-semibold text-sm text-blue">{t.respVerifyBusiness}</Text>
        </LinkButton>
      </View>
    );

  const pick = async () => {
    const picked = await api.pickPdf().catch(() => null);
    if (!picked) return;
    if (picked.mime !== "application/pdf" || picked.size > RESPONSE_FILE_MAX)
      return setProblem(t.respBadFile);
    setProblem(null);
    setFile(picked);
  };

  const send = async () => {
    if (note.trim().length > NOTE_MAX) return setProblem(t.respNoteTooLong(NOTE_MAX));
    setBusy(true);
    const result = await api.respond(post.id, note, file).catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") {
      setProblem(null);
      setOpen(false);
      return setAttempt((a) => a + 1);
    }
    setProblem(respondMessage(t, result));
  };

  const fields = (
    <>
      <Field
        label={application ? t.respNoteApply : t.respNoteInterest}
        value={note}
        onChange={setNote}
        multiline
        hint={t.respNoteHint}
      />
      <View className="flex-row flex-wrap items-center gap-3">
        <Button secondary label={application ? t.respAddCv : t.respAddFile} onPress={pick} />
        {file ? (
          <>
            <Text className="font-figtree text-sm text-ink">{file.name}</Text>
            <Pressable
              role="button"
              aria-label={t.respRemoveFile}
              onPress={() => setFile(null)}
              className="min-h-[40px] justify-center"
            >
              <Text className="font-figtree-semibold text-sm text-blue">{t.respRemoveFile}</Text>
            </Pressable>
          </>
        ) : (
          <Text className="font-figtree text-[13px] text-ink-2">{t.respFileHint}</Text>
        )}
      </View>
      <Message text={problem} />
    </>
  );
  const sendButton = (
    <Button label={application ? t.respApply : t.respInterest} onPress={send} disabled={busy} />
  );
  const formTitle = application ? t.respApplyTitle : t.respInterestTitle;

  if (phone)
    return (
      <>
        <Button
          label={application ? t.respApplyOpen : t.respInterestOpen}
          onPress={() => setOpen(true)}
        />
        <Sheet open={open} title={formTitle} onClose={() => setOpen(false)} footer={sendButton}>
          {fields}
        </Sheet>
      </>
    );

  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
        {formTitle}
      </Text>
      {fields}
      {sendButton}
    </View>
  );
}

/** S19: the member's applications and expressions of interest with their status (O03). */
export function MyResponses({ api }: { api: ResponsesApi }) {
  const { t, language } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.myResponses(), attempt);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <View className="gap-3">
      <ScreenTitle>{t.respMineTitle}</ScreenTitle>
      <Message text={problem} />
      {loaded.state === "failed" ? (
        <ErrorState message={t.respLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState
          title={t.respMineEmpty}
          message={t.respMineEmptyHint}
          action={{ label: t.navOpportunities, href: "/opportunities" }}
        />
      ) : (
        loaded.value.map((r) => (
          <View key={r.id} className="gap-2 rounded-card border border-line bg-surface p-4">
            <LinkButton
              href={`/opportunities/${r.opportunityId}`}
              label={r.title}
              className="gap-1"
            >
              <Text className="font-figtree-bold text-[16px] text-ink">{r.title}</Text>
              <Text className="font-figtree text-[13px] text-ink-2">
                {[
                  t[typeLabel[r.type]] as string,
                  r.kind === "application" ? t.respKindApplication : t.respKindInterest,
                  t.respSentOn(formatDate(r.sentAt, language)),
                ].join(" · ")}
              </Text>
            </LinkButton>
            <StatusBadge status={r.status} />
            {r.status === "new" ? (
              <View className="items-start">
                <ConfirmButton
                  label={t.respWithdraw}
                  question={t.respWithdrawConfirm}
                  confirmLabel={t.respWithdraw}
                  onConfirm={async () => {
                    if (await api.withdraw(r.id).catch(() => false)) {
                      setProblem(null);
                      setAttempt((a) => a + 1);
                    } else setProblem(t.respFailed);
                  }}
                />
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function ResponseCard({
  api,
  opportunityId,
  response,
  onChanged,
}: {
  api: ResponsesApi;
  opportunityId: string;
  response: PostResponse;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  const open = response.status === "new" || response.status === "shortlisted";
  const decide = async (status: "shortlisted" | "declined") => {
    if (await api.setStatus(response.id, status).catch(() => false)) onChanged();
    else setProblem(t.respFailed);
  };
  const openFile = async () => {
    const link = response.attachmentPath ? await api.fileLink(response.attachmentPath) : null;
    if (link) await Linking.openURL(link);
    else setProblem(t.respFileFailed);
  };
  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-4">
      <LinkButton
        href={`/profile/${response.memberId}`}
        label={response.memberName}
        className="self-start"
      >
        <Text className="font-figtree-bold text-[16px] text-blue">{response.memberName}</Text>
      </LinkButton>
      <Text className="font-figtree text-[13px] text-ink-2">
        {[
          response.kind === "application" ? t.respKindApplication : t.respKindInterest,
          t.respSentOn(formatDate(response.sentAt, language)),
        ].join(" · ")}
      </Text>
      <StatusBadge status={response.status} />
      {response.note ? (
        <Text className="font-figtree text-[15px] leading-6 text-ink">{response.note}</Text>
      ) : null}
      {response.attachmentPath ? (
        <Pressable
          role="link"
          aria-label={t.respOpenFile}
          onPress={openFile}
          className="min-h-[40px] justify-center self-start"
        >
          <Text className="font-figtree-semibold text-sm text-blue">{t.respOpenFile}</Text>
        </Pressable>
      ) : null}
      <Message text={problem} />
      {open ? (
        <View className="flex-row flex-wrap gap-2">
          {response.status === "new" ? (
            <Button label={t.respShortlist} onPress={() => decide("shortlisted")} />
          ) : null}
          <ConfirmButton
            label={t.respDecline}
            question={t.respDeclineConfirm}
            confirmLabel={t.respDecline}
            onConfirm={() => decide("declined")}
          />
          <ThreadButton api={api} opportunityId={opportunityId} other={response.memberId} />
        </View>
      ) : null}
    </View>
  );
}

/** S21: the responses to one of my posts, newest first, to shortlist or decline (O03). */
export function PostResponses({
  api,
  opportunityId,
}: {
  api: ResponsesApi;
  opportunityId: string;
}) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(() => api.forPost(opportunityId), attempt);
  return (
    <View className="gap-3">
      <LinkButton
        href="/opportunities/mine"
        label={t.myPostsTitle}
        className="min-h-[40px] justify-center"
      >
        <Text className="font-figtree-semibold text-sm text-blue">{t.myPostsTitle}</Text>
      </LinkButton>
      <ScreenTitle>{t.respForPostTitle}</ScreenTitle>
      {loaded.state === "failed" ? (
        <ErrorState message={t.respLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loaded.state === "loading" ? (
        <LoadingRows />
      ) : loaded.value.length === 0 ? (
        <EmptyState title={t.respForPostEmpty} message={t.respForPostEmptyHint} />
      ) : (
        loaded.value.map((r) => (
          <ResponseCard
            key={r.id}
            api={api}
            opportunityId={opportunityId}
            response={r}
            onChanged={() => setAttempt((a) => a + 1)}
          />
        ))
      )}
    </View>
  );
}

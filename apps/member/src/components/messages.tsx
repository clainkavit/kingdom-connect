import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import {
  fileProblem,
  MAX_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  type MessagesApi,
  type PickedFile,
  type Thread,
  type ThreadSummary,
} from "../lib/messages";
import { Button, ConfirmButton, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { ReportLink } from "./report-link";
import { Avatar } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

/** Opens (or starts) the thread with a connection. */
export function MessageButton({ memberId, api }: { memberId: string; api: MessagesApi }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  return (
    <View className="gap-2">
      <Button
        secondary
        label={t.messageButton}
        onPress={async () => {
          setFailed(false);
          const id = await api.openThread(memberId).catch(() => null);
          if (id) router.push(`/messages/${id}`);
          else setFailed(true);
        }}
      />
      <Message text={failed ? t.actionFailed : null} />
    </View>
  );
}

/** S14: threads, newest first. */
export function InboxScreen({ api }: { api: MessagesApi }) {
  const { t } = useLanguage();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    api.threads().then(
      (loaded) => live && setThreads(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, reloads]);

  if (failed)
    return (
      <ErrorState
        message={t.messagesLoadFailed}
        onRetry={() => {
          setFailed(false);
          setReloads((r) => r + 1);
        }}
      />
    );
  if (!threads) return <LoadingRows />;

  return (
    <View className="gap-4">
      <ScreenTitle>{t.navMessages}</ScreenTitle>
      {threads.length === 0 ? (
        <EmptyState title={t.noMessagesTitle} message={t.noMessagesMessage} />
      ) : (
        <View className="rounded-card border border-line bg-surface">
          {threads.map((item, i) => (
            <LinkButton
              key={item.threadId}
              href={`/messages/${item.threadId}`}
              label={
                item.unread
                  ? `${item.fullName || (item.otherDeleted ? t.deletedMember : t.memberUnavailable)}, ${t.unread}`
                  : item.fullName || (item.otherDeleted ? t.deletedMember : t.memberUnavailable)
              }
              className={`min-h-[64px] flex-row items-center gap-3 px-4 py-3 ${i < threads.length - 1 ? "border-b border-line" : ""}`}
            >
              <Avatar name={item.fullName || "?"} url={item.photoUrl} size={44} />
              <View className="flex-1 gap-0.5">
                <Text
                  className={`text-[15px] text-ink ${item.unread ? "font-figtree-bold" : "font-figtree-semibold"}`}
                >
                  {item.fullName || (item.otherDeleted ? t.deletedMember : t.memberUnavailable)}
                </Text>
                {item.ideaTitle ? (
                  <Text numberOfLines={1} className="font-figtree-semibold text-[13px] text-ink-2">
                    {t.threadAbout(item.ideaTitle)}
                  </Text>
                ) : null}
                <Text numberOfLines={1} className="font-figtree text-sm text-ink-2">
                  {item.lastDeleted ? t.messageDeleted : item.lastBody || t.attachmentPreview}
                </Text>
              </View>
              {item.unread ? (
                <View aria-hidden className="h-2.5 w-2.5 rounded-full bg-blue" />
              ) : null}
            </LinkButton>
          ))}
        </View>
      )}
    </View>
  );
}

function AttachmentView({
  fileName,
  mime,
  url,
}: {
  fileName: string;
  mime: string;
  url: string | null;
}) {
  if (url && mime.startsWith("image/"))
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={fileName}
        style={{ width: 200, height: 150, borderRadius: 8 }}
        resizeMode="cover"
      />
    );
  return (
    <Pressable
      role="link"
      aria-label={fileName}
      disabled={!url}
      onPress={() => url && Linking.openURL(url)}
      className="rounded-lg border border-line bg-surface px-3 py-2"
    >
      <Text className="font-figtree-semibold text-sm text-info-text">{fileName}</Text>
    </Pressable>
  );
}

/** S15: one conversation, with live updates. */
export function ThreadScreen({ api, threadId }: { api: MessagesApi; threadId: string }) {
  const { t } = useLanguage();
  const [thread, setThread] = useState<Thread | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.load(threadId).then(
      (loaded) => {
        if (!live) return;
        setThread(loaded);
        if (loaded) api.markRead(threadId).catch(() => undefined);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, threadId, reloads]);

  useEffect(() => api.subscribe(threadId, () => setReloads((r) => r + 1)), [api, threadId]);

  if (failed)
    return (
      <ErrorState
        message={t.messagesLoadFailed}
        onRetry={() => {
          setFailed(false);
          setReloads((r) => r + 1);
        }}
      />
    );
  if (thread === undefined) return <LoadingRows />;
  if (thread === null)
    return <EmptyState title={t.threadNotFound} message={t.threadNotFoundMessage} />;

  const choose = async () => {
    setProblem(null);
    const picked = await api.pickFile().catch(() => null);
    if (!picked) return;
    const wrong = fileProblem(picked);
    if (wrong === "too_large") return setProblem(t.fileTooLarge(MAX_FILE_BYTES / 1024 / 1024));
    if (wrong === "wrong_type") return setProblem(t.fileWrongType);
    setFile(picked);
  };

  const send = async () => {
    if (!body.trim() && !file) return;
    if ([...body.trim()].length > MAX_MESSAGE_LENGTH)
      return setProblem(t.messageTooLong(MAX_MESSAGE_LENGTH));
    setProblem(null);
    setBusy(true);
    const sent = await api.send(threadId, body, file).catch(() => false);
    setBusy(false);
    if (!sent) return setProblem(t.sendMessageFailed);
    setBody("");
    setFile(null);
    setReloads((r) => r + 1);
  };

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <LinkButton
          href={`/profile/${thread.otherId}`}
          label={thread.otherName || (thread.otherDeleted ? t.deletedMember : t.memberUnavailable)}
        >
          <ScreenTitle>
            {thread.otherName || (thread.otherDeleted ? t.deletedMember : t.memberUnavailable)}
          </ScreenTitle>
        </LinkButton>
        <ReportLink target={{ type: "thread", id: thread.id }} memberId={thread.otherId} />
      </View>
      {thread.ideaTitle ? (
        <Text className="font-figtree-semibold text-sm text-ink-2">
          {t.threadAbout(thread.ideaTitle)}
        </Text>
      ) : null}
      {thread.reported ? <Message tone="info" text={t.threadReported} /> : null}
      <View className="gap-3">
        {thread.messages.map((m) => (
          <View
            key={m.id}
            className={`max-w-[85%] gap-2 rounded-card px-3 py-2 ${m.mine ? "self-end bg-blue-soft" : "self-start border border-line bg-surface"}`}
          >
            {m.deleted ? (
              <Text className="font-figtree text-sm italic text-ink-2">{t.messageDeleted}</Text>
            ) : (
              <>
                {m.body ? (
                  <Text className="font-figtree text-[15px] leading-[22px] text-ink">{m.body}</Text>
                ) : null}
                {m.attachments.map((a) => (
                  <AttachmentView key={a.id} fileName={a.fileName} mime={a.mime} url={a.url} />
                ))}
                {m.mine && !thread.reported ? (
                  <ConfirmButton
                    label={t.deleteMessage}
                    question={t.confirmDeleteMessage}
                    confirmLabel={t.confirmDeleteButton}
                    onConfirm={async () => {
                      if (await api.remove(m.id).catch(() => false)) setReloads((r) => r + 1);
                      else setProblem(t.actionFailed);
                    }}
                  />
                ) : null}
              </>
            )}
          </View>
        ))}
      </View>
      {thread.canSend ? (
        <View className="gap-2 rounded-card border border-line bg-surface p-3">
          <Field label={t.writeMessage} value={body} onChange={setBody} multiline />
          {file ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-figtree text-sm text-ink">{file.name}</Text>
              <Button secondary label={t.removeFile(file.name)} onPress={() => setFile(null)} />
            </View>
          ) : null}
          <Message text={problem} />
          <View className="flex-row flex-wrap gap-2">
            <Button secondary label={t.attachFile} onPress={choose} />
            <Button
              label={t.sendMessage}
              onPress={send}
              disabled={busy || (!body.trim() && !file)}
            />
          </View>
        </View>
      ) : (
        <Message tone="info" text={t.cannotSend} />
      )}
    </View>
  );
}

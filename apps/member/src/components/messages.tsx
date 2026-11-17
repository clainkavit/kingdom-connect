import { useRouter } from "expo-router";
import { formatDate } from "@kingdom-connect/shared";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Lock from "lucide-react-native/icons/lock";
import Paperclip from "lucide-react-native/icons/paperclip";
import Search from "lucide-react-native/icons/search";
import Send from "lucide-react-native/icons/send";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, Text, TextInput, View } from "react-native";
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
import { Button, Chips, Message } from "./form";
import { usePalette } from "./palette";
import { LinkButton } from "./link-button";
import { ReportLink } from "./report-link";
import { Avatar } from "./profile";
import { ScreenTitle } from "./screens";
import { usePhone } from "./sheet";
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
const valid = (iso: string) => !Number.isNaN(new Date(iso).getTime());

const timeOf = (iso: string, language: string, now: Date) => {
  if (!valid(iso)) return "";
  const at = new Date(iso);
  const day = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const locale = language === "sw" ? "sw-TZ" : "en-TZ";
  if (day(at) === day(now))
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Africa/Dar_es_Salaam",
    }).format(at);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Dar_es_Salaam",
  }).format(at);
};

function InboxList({
  threads,
  selected,
  now,
}: {
  threads: ThreadSummary[];
  selected?: string | null;
  now: Date;
}) {
  const { t, language } = useLanguage();
  const nameOf = (item: ThreadSummary) =>
    item.fullName || (item.otherDeleted ? t.deletedMember : t.memberUnavailable);
  return (
    <View className="gap-1">
      {threads.map((item) => {
        const on = item.threadId === selected;
        return (
          <LinkButton
            key={item.threadId}
            href={`/messages/${item.threadId}`}
            current={on}
            label={item.unread ? `${nameOf(item)}, ${t.unread}` : nameOf(item)}
            className={`min-h-[68px] flex-row items-center gap-3 rounded-[14px] px-3 py-2.5 ${on ? "bg-blue-soft" : ""}`}
          >
            <Avatar name={item.fullName || "?"} url={item.photoUrl} size={44} />
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-[15px] text-ink ${item.unread ? "font-figtree-extrabold" : "font-figtree-bold"}`}
                >
                  {nameOf(item)}
                </Text>
                <Text
                  className={`text-[12px] ${item.unread ? "font-figtree-bold text-ink" : "font-figtree text-ink-2"}`}
                >
                  {timeOf(item.lastAt, language, now)}
                </Text>
              </View>
              {item.ideaTitle ? (
                <Text numberOfLines={1} className="font-figtree-semibold text-[12px] text-ink-2">
                  {t.threadAbout(item.ideaTitle)}
                </Text>
              ) : null}
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-[13px] ${item.unread ? "font-figtree-semibold text-ink" : "font-figtree text-ink-2"}`}
                >
                  {item.lastDeleted ? t.messageDeleted : item.lastBody || t.attachmentPreview}
                </Text>
                {item.unread ? (
                  <View aria-hidden className="h-2.5 w-2.5 rounded-full bg-navy" />
                ) : null}
              </View>
            </View>
          </LinkButton>
        );
      })}
    </View>
  );
}

function useThreads(api: MessagesApi) {
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
  return { threads, failed, retry: () => (setFailed(false), setReloads((r) => r + 1)) };
}

/** The canvas messages screen on a computer: the conversations on the left, one open on the right. */
export function MessagesTwoPane({
  api,
  threadId,
  now = new Date(),
}: {
  api: MessagesApi;
  threadId?: string | null;
  now?: Date;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const { threads, failed, retry } = useThreads(api);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "unread">("all");
  if (failed) return <ErrorState message={t.messagesLoadFailed} onRetry={retry} />;
  if (!threads) return <LoadingRows />;
  const selected = threadId ?? threads[0]?.threadId ?? null;
  const words = q.trim().toLowerCase();
  const shown = threads.filter(
    (th) =>
      (show === "all" || th.unread) &&
      (!words || `${th.fullName} ${th.lastBody}`.toLowerCase().includes(words)),
  );
  const unread = threads.filter((th) => th.unread).length;
  return (
    <View className="w-full max-w-[1280px] gap-5 self-center">
      <Text
        role="heading"
        aria-level={1}
        className="font-figtree-extrabold text-[30px] leading-[36px] text-ink"
      >
        {t.navMessages}
      </Text>
      {threads.length === 0 && !threadId ? (
        <EmptyState title={t.noMessagesTitle} message={t.noMessagesMessage} />
      ) : (
        <View className="min-h-[640px] flex-row overflow-hidden rounded-card border border-line bg-surface">
          <View className="w-[384px] gap-3 border-r border-line p-4">
            <View className="min-h-[44px] flex-row items-center gap-2.5 rounded-full border border-line bg-bg px-4">
              <Search size={17} color={palette.ink2} aria-hidden />
              <TextInput
                aria-label={t.searchMessages}
                placeholder={t.searchMessages}
                placeholderTextColor={palette.ink3}
                value={q}
                onChangeText={setQ}
                className="flex-1 font-figtree text-[15px] text-ink"
              />
            </View>
            <Chips
              hideLabel
              label={t.messagesShow}
              options={[
                { value: "all", label: t.oppAll },
                { value: "unread", label: t.unreadCount(unread) },
              ]}
              value={show}
              onChange={(v) => setShow(v as "all" | "unread")}
            />
            <InboxList threads={shown} selected={selected} now={now} />
          </View>
          <View className="min-w-0 flex-1">
            {selected ? (
              <ThreadScreen key={selected} api={api} threadId={selected} embedded />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

/** S14 on a phone: a white band with the title, search and All or Unread, then the conversations. */
export function InboxScreen({ api }: { api: MessagesApi }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const { threads, failed, retry } = useThreads(api);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "unread">("all");
  if (failed) return <ErrorState message={t.messagesLoadFailed} onRetry={retry} />;
  if (!threads) return <LoadingRows />;
  const words = q.trim().toLowerCase();
  const shown = threads.filter(
    (th) =>
      (show === "all" || th.unread) &&
      (!words || `${th.fullName} ${th.lastBody}`.toLowerCase().includes(words)),
  );
  const unread = threads.filter((th) => th.unread).length;
  return (
    <View className="gap-3">
      <View className="-mx-5 -mt-4 gap-3 border-b border-line bg-surface px-5 pb-4 pt-4">
        <ScreenTitle>{t.navMessages}</ScreenTitle>
        {threads.length ? (
          <>
            <View className="min-h-[48px] flex-row items-center gap-2.5 rounded-full border border-line bg-bg px-4">
              <Search size={17} color={palette.ink2} aria-hidden />
              <TextInput
                aria-label={t.searchMessages}
                placeholder={t.searchMessages}
                placeholderTextColor={palette.ink3}
                value={q}
                onChangeText={setQ}
                className="flex-1 font-figtree text-[15px] text-ink"
              />
            </View>
            <Chips
              hideLabel
              label={t.messagesShow}
              options={[
                { value: "all", label: t.oppAll },
                { value: "unread", label: t.unreadCount(unread) },
              ]}
              value={show}
              onChange={(v) => setShow(v as "all" | "unread")}
            />
          </>
        ) : null}
      </View>
      {threads.length === 0 ? (
        <EmptyState title={t.noMessagesTitle} message={t.noMessagesMessage} />
      ) : (
        <InboxList threads={shown} now={new Date()} />
      )}
      <Text className="font-figtree text-[14px] leading-[21px] text-ink-2">
        {t.messagesConnectionsOnly}
      </Text>
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
export function ThreadScreen({
  api,
  threadId,
  embedded,
}: {
  api: MessagesApi;
  threadId: string;
  /** Inside the computer two-pane: a compact header and the conversation filling the pane. */
  embedded?: boolean;
}) {
  const { t, language } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [thread, setThread] = useState<Thread | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const name = thread.otherName || (thread.otherDeleted ? t.deletedMember : t.memberUnavailable);
  const first = name.split(/\s+/)[0] ?? name;
  const dayOf = (iso: string) =>
    valid(iso) ? new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 10) : "";
  const today = dayOf(new Date().toISOString());
  const clock = (iso: string) =>
    !valid(iso)
      ? ""
      : new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-TZ", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: "Africa/Dar_es_Salaam",
        }).format(new Date(iso));

  return (
    <View className={embedded ? "flex-1" : "gap-4"}>
      <View
        className={`flex-row flex-wrap items-center justify-between gap-3 ${embedded ? "border-b border-line px-5 py-3.5" : ""}`}
      >
        <View
          className={`min-w-0 flex-row items-center gap-3 ${phone && !embedded ? "w-full" : "flex-1"}`}
        >
          {phone && !embedded ? (
            <LinkButton
              href="/messages"
              label={t.navMessages}
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              <ChevronLeft size={22} color={palette.navy} aria-hidden />
            </LinkButton>
          ) : null}
          <Avatar name={name} url={null} size={44} />
          <View className="min-w-0 flex-1">
            <Text
              role="heading"
              aria-level={embedded ? 2 : 1}
              className={`font-figtree-bold text-ink ${embedded ? "text-[16px]" : "text-[20px]"}`}
            >
              {name}
            </Text>
            {thread.ideaTitle ? (
              <Text className="font-figtree text-[13px] text-ink-2">
                {t.threadAbout(thread.ideaTitle)}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <LinkButton
            href={`/profile/${thread.otherId}`}
            label={t.viewProfile}
            className="min-h-[40px] items-center justify-center rounded-full border border-line-2 bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-[14px] text-navy">{t.viewProfile}</Text>
          </LinkButton>
          <ReportLink target={{ type: "thread", id: thread.id }} memberId={thread.otherId} />
        </View>
      </View>
      {thread.reported ? <Message tone="info" text={t.threadReported} /> : null}
      <View className={`gap-1.5 ${embedded ? "flex-1 bg-bg px-6 py-5" : ""}`}>
        {thread.messages.map((m, idx) => {
          const day = dayOf(m.createdAt);
          const newDay = idx === 0 || dayOf(thread.messages[idx - 1]!.createdAt) !== day;
          return (
            <View key={m.id} className="gap-1">
              {newDay && day ? (
                <View className="items-center py-2">
                  <Text className="rounded-full border border-line bg-surface px-3 py-0.5 font-figtree-bold text-[12px] text-ink">
                    {day === today ? t.growthToday : formatDate(new Date(m.createdAt), language)}
                  </Text>
                </View>
              ) : null}
              <View
                className={`max-w-[80%] gap-2 rounded-[18px] px-4 py-2.5 ${m.mine ? "self-end bg-navy" : "self-start border border-line bg-surface"}`}
              >
                {m.deleted ? (
                  <Text
                    className={`font-figtree text-sm italic ${m.mine ? "text-navy-ink" : "text-ink-2"}`}
                  >
                    {t.messageDeleted}
                  </Text>
                ) : (
                  <>
                    {m.body ? (
                      <Text
                        className={`font-figtree text-[15px] leading-[22px] ${m.mine ? "text-white" : "text-ink"}`}
                      >
                        {m.body}
                      </Text>
                    ) : null}
                    {m.attachments.map((a) => (
                      <AttachmentView key={a.id} fileName={a.fileName} mime={a.mime} url={a.url} />
                    ))}
                  </>
                )}
              </View>
              <Text
                className={`font-figtree text-[12px] text-ink-2 ${m.mine ? "self-end" : "self-start"}`}
              >
                {clock(m.createdAt)}
              </Text>
              {m.mine && !m.deleted && !thread.reported ? (
                deleting === m.id ? (
                  <View className="flex-row flex-wrap items-center gap-3 self-end">
                    <Text className="font-figtree text-[12px] text-ink-2">
                      {t.confirmDeleteMessage}
                    </Text>
                    <Pressable
                      role="button"
                      aria-label={t.confirmDeleteButton}
                      onPress={async () => {
                        setDeleting(null);
                        if (await api.remove(m.id).catch(() => false)) setReloads((r) => r + 1);
                        else setProblem(t.actionFailed);
                      }}
                    >
                      <Text className="font-figtree-bold text-[12px] text-bad-text">
                        {t.confirmDeleteButton}
                      </Text>
                    </Pressable>
                    <Pressable
                      role="button"
                      aria-label={t.cancel}
                      onPress={() => setDeleting(null)}
                    >
                      <Text className="font-figtree-semibold text-[12px] text-ink-2">
                        {t.cancel}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    role="button"
                    aria-label={t.deleteMessage}
                    onPress={() => setDeleting(m.id)}
                    className="self-end"
                  >
                    <Text className="font-figtree-semibold text-[12px] text-ink-2 underline">
                      {t.deleteMessage}
                    </Text>
                  </Pressable>
                )
              ) : null}
            </View>
          );
        })}
      </View>
      <View
        className={`flex-row items-center justify-center gap-1.5 ${embedded ? "bg-bg pb-2" : ""}`}
      >
        <Lock size={12} color={palette.ink2} aria-hidden />
        <Text className="font-figtree text-[12px] text-ink-2">{t.threadPrivacy(first)}</Text>
      </View>
      {thread.canSend ? (
        <View className={`gap-2 ${embedded ? "border-t border-line px-5 py-3.5" : ""}`}>
          {file ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-figtree text-sm text-ink">{file.name}</Text>
              <Button secondary label={t.removeFile(file.name)} onPress={() => setFile(null)} />
            </View>
          ) : null}
          <Message text={problem} />
          <View className="flex-row items-center gap-2">
            <Pressable
              role="button"
              aria-label={t.attachFile}
              onPress={choose}
              className="h-11 w-11 items-center justify-center rounded-full"
            >
              <Paperclip size={20} color={palette.ink2} aria-hidden />
            </Pressable>
            <TextInput
              aria-label={t.writeMessage}
              placeholder={t.writeMessage}
              placeholderTextColor={palette.ink3}
              value={body}
              onChangeText={setBody}
              multiline
              className="max-h-[120px] min-h-[48px] flex-1 rounded-full border border-field bg-bg px-5 py-3 font-figtree text-[15px] leading-[22px] text-ink"
            />
            <Pressable
              role="button"
              aria-label={t.sendMessage}
              aria-disabled={busy || (!body.trim() && !file)}
              disabled={busy || (!body.trim() && !file)}
              onPress={send}
              className={`h-12 w-12 items-center justify-center rounded-full bg-navy ${busy || (!body.trim() && !file) ? "opacity-50" : ""}`}
            >
              <Send size={20} color="#ffffff" aria-hidden />
            </Pressable>
          </View>
        </View>
      ) : (
        <Message tone="info" text={t.cannotSend} />
      )}
    </View>
  );
}

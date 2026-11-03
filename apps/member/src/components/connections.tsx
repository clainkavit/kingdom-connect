import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  MAX_NOTE_LENGTH,
  MAX_REQUESTS_PER_DAY,
  noteLength,
  type BlockedMember,
  type ConnectionsApi,
  type Person,
  type ReceivedRequest,
  type Relation,
  type SendResult,
  type SentRequest,
} from "../lib/connections";
import { useLanguage } from "../lib/language";
import type { MessagesApi } from "../lib/messages";
import { Button, ConfirmButton, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { MessageButton } from "./messages";
import { ReportLink } from "./report-link";
import { Avatar, Section } from "./profile";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function PersonRow({ person, children }: { person: Person; children?: React.ReactNode }) {
  return (
    <View className="gap-3 border-b border-line py-3">
      <LinkButton
        href={`/profile/${person.memberId}`}
        label={person.fullName}
        className="flex-row items-center gap-3"
      >
        <Avatar name={person.fullName} url={person.photoUrl} size={44} />
        <View className="flex-1 gap-0.5">
          <Text className="font-figtree-bold text-[15px] text-ink">{person.fullName}</Text>
          {person.headline ? (
            <Text className="font-figtree text-sm text-ink-2">{person.headline}</Text>
          ) : null}
        </View>
      </LinkButton>
      {children}
    </View>
  );
}

type Lists = { received: ReceivedRequest[]; sent: SentRequest[]; connections: Person[] };

/** S13: requests received, requests sent and my connections. */
export function ConnectionsScreen({
  api,
  messagesApi,
}: {
  api: ConnectionsApi;
  messagesApi: MessagesApi;
}) {
  const { t } = useLanguage();
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([api.received(), api.sent(), api.connections()]).then(
      ([received, sent, connections]) => live && setLists({ received, sent, connections }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  const act = async (action: () => Promise<boolean>) => {
    setActionFailed(false);
    if (await action().catch(() => false)) setAttempt((a) => a + 1);
    else setActionFailed(true);
  };

  if (failed)
    return (
      <ErrorState
        message={t.connectionsLoadFailed}
        onRetry={() => {
          setFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (!lists) return <LoadingRows />;

  return (
    <View className="gap-4">
      <ScreenTitle>{t.navConnections}</ScreenTitle>
      <Message text={actionFailed ? t.actionFailed : null} />
      <Section title={t.requestsReceived}>
        {lists.received.length ? (
          lists.received.map((r) => (
            <PersonRow key={r.requestId} person={r}>
              {r.note ? <Text className="font-figtree text-sm text-ink">{r.note}</Text> : null}
              <View className="flex-row flex-wrap gap-2">
                <Button label={t.accept} onPress={() => act(() => api.answer(r.requestId, true))} />
                <Button
                  secondary
                  label={t.decline}
                  onPress={() => act(() => api.answer(r.requestId, false))}
                />
              </View>
            </PersonRow>
          ))
        ) : (
          <EmptyState
            title={t.noRequests}
            message={t.noRequestsMessage}
            action={{ label: t.findPeople, href: "/people" }}
          />
        )}
      </Section>
      <Section title={t.requestsSent}>
        {lists.sent.length ? (
          lists.sent.map((r) => (
            <PersonRow key={r.requestId} person={r}>
              <View className="flex-row flex-wrap items-center gap-3">
                <Text className="font-figtree text-sm text-ink-2">{t.requestSent}</Text>
                <Button
                  secondary
                  label={t.withdraw}
                  onPress={() => act(() => api.withdraw(r.requestId))}
                />
              </View>
            </PersonRow>
          ))
        ) : (
          <Text className="font-figtree text-sm text-ink-2">{t.noSentRequests}</Text>
        )}
      </Section>
      <Section title={t.myConnections}>
        {lists.connections.length ? (
          lists.connections.map((p) => (
            <PersonRow key={p.memberId} person={p}>
              <MessageButton memberId={p.memberId} api={messagesApi} />
              <ConfirmButton
                label={t.removeConnection}
                question={t.confirmRemove(p.fullName)}
                confirmLabel={t.confirmRemoveButton}
                onConfirm={() => act(() => api.remove(p.memberId))}
              />
            </PersonRow>
          ))
        ) : (
          <Text className="font-figtree text-sm text-ink-2">{t.noConnections}</Text>
        )}
      </Section>
    </View>
  );
}

/** The connect, remove and block actions on someone else's profile (S11). */
export function ConnectPanel({
  memberId,
  name,
  api,
  messagesApi,
  startWriting = false,
  onBlocked,
}: {
  memberId: string;
  name: string;
  api: ConnectionsApi;
  messagesApi: MessagesApi;
  startWriting?: boolean;
  onBlocked: () => void;
}) {
  const { t } = useLanguage();
  const [relation, setRelation] = useState<Relation | null>(null);
  const [writing, setWriting] = useState(startWriting);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SendResult | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.relation(memberId).then(setRelation, () => setRelation("none"));
  }, [api, memberId]);

  const refusalMessage: Record<Exclude<SendResult, "sent" | "connected">, string> = {
    daily_limit: t.sendDailyLimit(MAX_REQUESTS_PER_DAY),
    already_sent: t.sendAlreadySent,
    they_asked_you: t.sendTheyAskedYou,
    already_connected: t.sendAlreadyConnected,
    not_available: t.sendNotAvailable,
    failed: t.sendFailed,
  };

  const send = async () => {
    setBusy(true);
    const sent = await api.send(memberId, note);
    setBusy(false);
    setResult(sent);
    if (sent === "sent" || sent === "connected") {
      setWriting(false);
      setRelation(sent);
    } else if (sent === "they_asked_you") setRelation("received");
    else if (sent === "already_connected") setRelation("connected");
  };

  if (!relation) return null;

  return (
    <View className="gap-3">
      {relation === "none" && !writing ? (
        <Button label={t.connect} onPress={() => setWriting(true)} />
      ) : null}
      {relation === "none" && writing ? (
        <View className="gap-2">
          <Field
            label={t.connectNote}
            value={note}
            onChange={setNote}
            multiline
            hint={t.connectNoteHint(MAX_NOTE_LENGTH)}
            problem={noteLength(note) > MAX_NOTE_LENGTH ? t.tooLongField(MAX_NOTE_LENGTH) : null}
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t.sendRequest}
              onPress={send}
              disabled={busy || noteLength(note) > MAX_NOTE_LENGTH}
            />
            <Button secondary label={t.cancel} onPress={() => setWriting(false)} />
          </View>
        </View>
      ) : null}
      {relation === "sent" ? (
        <Text className="font-figtree-semibold text-sm text-ink-2">{t.requestSent}</Text>
      ) : null}
      {relation === "received" ? (
        <LinkButton
          href="/connections"
          label={t.respondInConnections}
          className="min-h-[44px] items-center justify-center rounded-[9px] bg-blue px-4"
        >
          <Text className="font-figtree-bold text-sm text-blue-ink">{t.respondInConnections}</Text>
        </LinkButton>
      ) : null}
      {relation === "connected" ? (
        <View className="gap-2">
          <Text className="font-figtree-semibold text-sm text-good-text">{t.connected}</Text>
          <MessageButton memberId={memberId} api={messagesApi} />
          <ConfirmButton
            label={t.removeConnection}
            question={t.confirmRemove(name)}
            confirmLabel={t.confirmRemoveButton}
            onConfirm={async () => {
              setActionFailed(false);
              if (await api.remove(memberId).catch(() => false)) setRelation("none");
              else setActionFailed(true);
            }}
          />
        </View>
      ) : null}
      {result && result !== "sent" && result !== "connected" ? (
        <Message text={refusalMessage[result]} />
      ) : null}
      <Message text={actionFailed ? t.actionFailed : null} />
      <ReportLink target={{ type: "profile", id: memberId }} memberId={memberId} />
      <ConfirmButton
        label={t.blockMember}
        question={t.confirmBlock(name)}
        confirmLabel={t.confirmBlockButton}
        onConfirm={async () => {
          setActionFailed(false);
          if (await api.block(memberId).catch(() => false)) onBlocked();
          else setActionFailed(true);
        }}
      />
    </View>
  );
}

/** S45: the members you blocked, to unblock. */
export function BlockedList({ api }: { api: ConnectionsApi }) {
  const { t } = useLanguage();
  const [blocked, setBlocked] = useState<BlockedMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    api.blocked().then(setBlocked, () => setLoadFailed(true));
  }, [api, reloads]);

  if (loadFailed)
    return (
      <ErrorState
        message={t.connectionsLoadFailed}
        onRetry={() => {
          setLoadFailed(false);
          setReloads((r) => r + 1);
        }}
      />
    );
  if (!blocked) return null;
  return (
    <Section title={t.blockedTitle}>
      {blocked.length ? (
        blocked.map((b) => (
          <View
            key={b.memberId}
            className="flex-row flex-wrap items-center justify-between gap-2 py-1"
          >
            <Text className="font-figtree text-[15px] text-ink">{b.fullName}</Text>
            <Button
              secondary
              label={t.unblock(b.fullName)}
              onPress={async () => {
                setFailed(false);
                if (await api.unblock(b.memberId).catch(() => false)) setReloads((r) => r + 1);
                else setFailed(true);
              }}
            />
          </View>
        ))
      ) : (
        <Text className="font-figtree text-sm text-ink-2">{t.noBlocked}</Text>
      )}
      <Text className="font-figtree text-[13px] text-ink-2">{t.unblockHint}</Text>
      <Message text={failed ? t.actionFailed : null} />
    </Section>
  );
}

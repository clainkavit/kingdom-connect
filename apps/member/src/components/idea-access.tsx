import { IDEA_SEEKING, type IdeaSeeking, type Strings } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { IdeaAccessApi, RequestCard, RequestStatus, TicketBand } from "../lib/idea-access";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button, Checkbox, Chips, ConfirmButton, Message } from "./form";
import { seekingLabel } from "./ideas";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { ErrorState, LoadingRows } from "./states";

const myStatusText = (t: Strings, status: RequestStatus): string =>
  ({
    pending: t.interestSent,
    approved: t.interestApproved,
    declined: t.interestDeclined,
    nda_accepted: t.interestHasAccess,
    revoked: t.interestRevoked,
  })[status];

const ownerStatusText = (t: Strings, status: RequestStatus): string =>
  ({
    pending: t.accessPending,
    approved: t.accessApprovedStatus,
    declined: t.accessDeclinedStatus,
    nda_accepted: t.accessHasAccessStatus,
    revoked: t.accessRevokedStatus,
  })[status];

export const bandLabel = (t: Strings, band: TicketBand | null): string =>
  band === null
    ? t.accessAnyBand
    : {
        under_10m: t.accessBandUnder10m,
        "10m_to_50m": t.accessBand10mTo50m,
        over_50m: t.accessBandOver50m,
      }[band];

/** S23: "I'm interested", or where the member's request stands (I03). */
export function IdeaInterest({ api, ideaId }: { api: IdeaAccessApi; ideaId: string }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    async () => ({ mine: await api.myRequest(ideaId), investor: await api.isInvestor() }),
    attempt,
  );
  const [role, setRole] = useState<IdeaSeeking | undefined>(undefined);
  const [anonymous, setAnonymous] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.recordView(ideaId).catch(() => undefined);
  }, [api, ideaId]);

  if (loaded.state === "failed") {
    return <ErrorState message={t.interestFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows rows={1} />;
  const { mine, investor } = loaded.value;
  if (mine) return <Message text={myStatusText(t, mine.status)} tone="info" />;

  const send = async () => {
    const asRole = anonymous ? "investor" : role;
    if (!asRole) return setProblem(t.ideaProblemSeeking);
    setBusy(true);
    setProblem(null);
    const result = await api.express(ideaId, asRole, anonymous).catch(() => "error");
    setBusy(false);
    if (result === "ok" || result === "already_requested") setAttempt((a) => a + 1);
    else setProblem(t.interestFailed);
  };

  return (
    <Section title={t.interestTitle}>
      {anonymous ? null : (
        <Chips<IdeaSeeking>
          label={t.interestRoleLabel}
          options={IDEA_SEEKING.map((s) => ({ value: s, label: seekingLabel(t, s) }))}
          value={role}
          onChange={setRole}
        />
      )}
      {investor ? (
        <>
          <Checkbox label={t.interestAnonymous} checked={anonymous} onChange={setAnonymous} />
          {anonymous ? (
            <Text className="font-figtree text-[13px] text-ink-2">{t.interestAnonymousHint}</Text>
          ) : null}
        </>
      ) : null}
      <Message text={problem} />
      <Button label={t.interestSend} disabled={busy} onPress={send} />
    </Section>
  );
}

function RequestRow({
  card,
  api,
  onChanged,
}: {
  card: RequestCard;
  api: IdeaAccessApi;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (run: () => Promise<string>) => {
    setBusy(true);
    setProblem(null);
    const result = await run().catch(() => "error");
    setBusy(false);
    if (result === "ok") onChanged();
    else setProblem(t.interestFailed);
  };
  const sector = language === "sw" ? card.sectorSw : card.sectorEn;

  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-4">
      {card.requesterId && card.requesterName ? (
        <LinkButton
          href={`/profile/${card.requesterId}`}
          label={card.requesterName}
          className="min-h-[44px] justify-center"
        >
          <Text className="font-figtree-bold text-[16px] text-blue">{card.requesterName}</Text>
        </LinkButton>
      ) : (
        <Text className="font-figtree-bold text-[16px] text-ink">{t.accessVerifiedInvestor}</Text>
      )}
      {card.requesterHeadline ? (
        <Text className="font-figtree text-[14px] text-ink">{card.requesterHeadline}</Text>
      ) : null}
      {card.anonymous ? (
        <Text className="font-figtree text-[13px] text-ink-2">
          {[sector, bandLabel(t, card.ticketBand)].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <Text className="font-figtree text-[13px] text-ink-2">
        {t.accessAsRole(seekingLabel(t, card.role))} · {ownerStatusText(t, card.status)}
      </Text>
      <Message text={problem} />
      {card.status === "pending" ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t.accessApprove}
            disabled={busy}
            onPress={() => act(() => api.decide(card.id, true))}
          />
          <Button
            secondary
            label={t.accessDecline}
            disabled={busy}
            onPress={() => act(() => api.decide(card.id, false))}
          />
        </View>
      ) : card.status === "approved" || card.status === "nda_accepted" ? (
        <ConfirmButton
          label={t.accessRevoke}
          question={t.accessRevokeConfirm}
          confirmLabel={t.accessRevoke}
          onConfirm={() => act(() => api.revoke(card.id))}
        />
      ) : null}
    </View>
  );
}

/** S28: the owner's access manager: who asked, approve or decline, remove access, and the investor view count. */
export function AccessManager({ api, ideaId }: { api: IdeaAccessApi; ideaId: string }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    async () => ({ cards: await api.requests(ideaId), views: await api.viewCount(ideaId) }),
    attempt,
  );
  const reload = () => setAttempt((a) => a + 1);

  return (
    <Section title={t.accessTitle}>
      {loaded.state === "failed" ? (
        <ErrorState message={t.interestFailed} onRetry={reload} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={1} />
      ) : (
        <>
          <Text className="font-figtree-semibold text-[13px] text-ink-2">
            {t.accessViewedBy(loaded.value.views)}
          </Text>
          {loaded.value.cards.length === 0 ? (
            <Text className="font-figtree text-sm text-ink-2">{t.accessEmpty}</Text>
          ) : (
            loaded.value.cards.map((card) => (
              <RequestRow key={card.id} card={card} api={api} onChanged={reload} />
            ))
          )}
        </>
      )}
    </Section>
  );
}

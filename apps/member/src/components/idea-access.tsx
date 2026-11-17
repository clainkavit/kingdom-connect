import { IDEA_SEEKING, type IdeaSeeking, type Strings } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { IdeaAccessApi, RequestCard, RequestStatus, TicketBand } from "../lib/idea-access";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Button, Checkbox, Chips, ConfirmButton, Message } from "./form";
import { seekingLabel } from "./ideas";
import { LinkButton } from "./link-button";
import { useLook } from "./look";
import { AcceptTexts } from "./legal";
import { Section } from "./profile";
import { ErrorState, LoadingRows } from "./states";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";
import Eye from "lucide-react-native/icons/eye";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Star from "lucide-react-native/icons/star";

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

/** S26, for the owner and for a requester past the NDA. */
export function DetailsLink({ ideaId }: { ideaId: string }) {
  const { t } = useLanguage();
  return (
    <LinkButton
      href={`/ideas/${ideaId}/details`}
      label={t.ideaOpenDetails}
      className="min-h-[48px] items-center justify-center rounded-full bg-blue px-4"
    >
      <Text className="font-figtree-bold text-[15px] text-blue-ink">{t.ideaOpenDetails}</Text>
    </LinkButton>
  );
}

/** S31 with this idea and partner chosen. The requester leaves out the owner, whose id may be hidden. */
function PlanLink({ ideaId, otherId }: { ideaId: string; otherId: string | null }) {
  const { t } = useLanguage();
  return (
    <LinkButton
      href={otherId ? `/plans/new?idea=${ideaId}&with=${otherId}` : `/plans/new?idea=${ideaId}`}
      label={t.planPropose}
      className="min-h-[44px] items-center justify-center rounded-full border border-line-2 bg-surface px-4"
    >
      <Text className="font-figtree-semibold text-sm text-ink-2">{t.planPropose}</Text>
    </LinkButton>
  );
}

/** Opens the idea thread with the other side, made when the NDA was accepted. */
function MessageButton({
  api,
  ideaId,
  otherId,
  label,
}: {
  api: IdeaAccessApi;
  ideaId: string;
  otherId: string | null;
  label: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <Button
        secondary
        label={label}
        onPress={async () => {
          const thread = await api.thread(ideaId, otherId).catch(() => null);
          if (thread) router.push(`/messages/${thread}`);
          else setProblem(t.interestFailed);
        }}
      />
      <Message text={problem} />
    </>
  );
}

/** S25: the current NDA and IP terms, both languages, for an approved requester (I04). */
function IdeaTerms({
  api,
  requestId,
  onAccepted,
}: {
  api: IdeaAccessApi;
  requestId: string;
  onAccepted: () => void;
}) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    async () => ({
      texts: await api.terms(requestId),
      entity: await api.entityName().catch(() => ""),
    }),
    attempt,
  );
  const [problem, setProblem] = useState<string | null>(null);
  if (loaded.state === "failed") {
    return <ErrorState message={t.interestFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows rows={2} />;
  if (loaded.value.texts.length < 2) return <Message text={t.ndaMissing} tone="info" />;
  return (
    <Section title={t.interestApproved}>
      <Message text={problem} />
      <AcceptTexts
        key={attempt}
        texts={loaded.value.texts}
        entityName={loaded.value.entity}
        intro={t.ndaIntro}
        acceptLabel={t.ndaAccept}
        onAccept={async (ids) => {
          const result = await api.acceptTerms(requestId, ids);
          if (result === "ok" || result === "already_accepted") return onAccepted();
          if (result === "texts_changed") {
            setProblem(t.ndaChanged);
            setAttempt((a) => a + 1);
            return;
          }
          throw new Error(result);
        }}
      />
    </Section>
  );
}

/** S23: "I'm interested", or where the member's request stands (I03), then the NDA (I04). */
export function IdeaInterest({ api, ideaId }: { api: IdeaAccessApi; ideaId: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    async () => ({ mine: await api.myRequest(ideaId), investor: await api.isInvestor() }),
    attempt,
  );
  const [role, setRole] = useState<IdeaSeeking | undefined>(undefined);
  const [anonymous, setAnonymous] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const look = useLook();

  useEffect(() => {
    if (!look.looking) api.recordView(ideaId).catch(() => undefined);
  }, [api, ideaId, look.looking]);

  if (look.looking) return <Button label={t.interestSend} onPress={() => look.ask("interest")} />;
  if (loaded.state === "failed") {
    return <ErrorState message={t.interestFailed} onRetry={() => setAttempt((a) => a + 1)} />;
  }
  if (loaded.state === "loading") return <LoadingRows rows={1} />;
  const { mine, investor } = loaded.value;
  if (mine?.status === "approved") {
    return <IdeaTerms api={api} requestId={mine.id} onAccepted={() => setAttempt((a) => a + 1)} />;
  }
  if (mine?.status === "nda_accepted") {
    return (
      <View className="gap-2">
        <Message text={t.interestHasAccess} tone="info" />
        <DetailsLink ideaId={ideaId} />
        <PlanLink ideaId={ideaId} otherId={null} />
        <MessageButton api={api} ideaId={ideaId} otherId={null} label={t.ideaMessageOwner} />
      </View>
    );
  }
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
    <View className="gap-3.5 rounded-card border-2 border-navy bg-surface px-5 py-5">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[18px] text-ink">
        {t.interestTitle}
      </Text>
      <Text className="font-figtree text-[14px] leading-[21px] text-ink-2">{t.interestIntro}</Text>
      {anonymous ? null : (
        <Chips<IdeaSeeking>
          hideLabel
          label={t.interestRoleLabel}
          options={IDEA_SEEKING.map((s) => ({ value: s, label: seekingLabel(t, s) }))}
          value={role}
          onChange={setRole}
        />
      )}
      {investor ? (
        <>
          <View
            className={`rounded-[16px] px-4 py-2 ${anonymous ? "bg-warn-soft" : "border border-line bg-surface"}`}
          >
            <Checkbox label={t.interestAnonymous} checked={anonymous} onChange={setAnonymous} />
          </View>
          {anonymous ? (
            <View className="gap-2 rounded-[16px] border border-line bg-surface-2 px-4 py-3">
              <Text className="font-figtree-bold text-[11px] tracking-[0.06em] text-ink-2">
                {t.interestOwnerSees.toUpperCase()}
              </Text>
              <View className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-warn-soft">
                  <ShieldCheck size={16} color={palette.navy} aria-hidden />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-figtree-bold text-[15px] text-ink">
                    {t.accessVerifiedInvestor}
                  </Text>
                  <Text className="font-figtree text-[13px] leading-5 text-ink-2">
                    {t.interestAnonymousHint}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
      <Message text={problem} />
      <Button label={t.interestSend} disabled={busy} onPress={send} />
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.interestAfter}</Text>
    </View>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function RequestRow({
  card,
  api,
  ideaId,
  onChanged,
}: {
  card: RequestCard;
  api: IdeaAccessApi;
  ideaId: string;
  onChanged: () => void;
}) {
  const { t, language } = useLanguage();
  const palette = usePalette();
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
  const pending = card.status === "pending";
  const access = card.status === "approved" || card.status === "nda_accepted";
  const name = card.requesterName ?? t.accessVerifiedInvestor;

  return (
    <View
      className={`gap-2 rounded-[18px] px-4 py-3.5 ${pending ? "border border-line bg-surface-2" : ""}`}
    >
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-warn-soft">
          {card.requesterName ? (
            <Text className="font-figtree-bold text-[15px] text-navy">{initialsOf(name)}</Text>
          ) : (
            <ShieldCheck size={18} color={palette.navy} aria-hidden />
          )}
        </View>
        <View className="min-w-[160px] flex-1 gap-0.5">
          {card.requesterId && card.requesterName ? (
            <LinkButton
              href={`/profile/${card.requesterId}`}
              label={card.requesterName}
              className="self-start"
            >
              <Text className="font-figtree-bold text-[16px] text-ink underline">
                {card.requesterName}
              </Text>
            </LinkButton>
          ) : (
            <Text className="font-figtree-bold text-[16px] text-ink">{name}</Text>
          )}
          {card.requesterHeadline ? (
            <Text className="font-figtree text-[13px] text-ink-2">{card.requesterHeadline}</Text>
          ) : null}
          {card.anonymous ? (
            <Text className="font-figtree text-[13px] text-ink-2">
              {[sector, bandLabel(t, card.ticketBand)].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          {pending ? null : (
            <Text className="font-figtree text-[13px] text-ink-2">
              {seekingLabel(t, card.role)} · {ownerStatusText(t, card.status)}
            </Text>
          )}
        </View>
        {pending ? (
          <>
            <Text className="rounded-full bg-warn-soft px-2.5 py-1 font-figtree-bold text-[12px] text-warn-text">
              {seekingLabel(t, card.role)}
            </Text>
            <Text className="sr-only">{t.accessAsRole(seekingLabel(t, card.role))}</Text>
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
          </>
        ) : access ? (
          <View className="flex-row flex-wrap items-center gap-2">
            {card.status === "nda_accepted" && card.requesterId ? (
              <MessageButton
                api={api}
                ideaId={ideaId}
                otherId={card.requesterId}
                label={t.ideaMessage}
              />
            ) : null}
            <ConfirmButton
              label={t.accessRevoke}
              question={t.accessRevokeConfirm}
              confirmLabel={t.accessRevoke}
              onConfirm={() => act(() => api.revoke(card.id))}
            />
          </View>
        ) : null}
      </View>
      {access && card.status === "nda_accepted" && card.requesterId ? (
        <View className="pl-14">
          <PlanLink ideaId={ideaId} otherId={card.requesterId} />
        </View>
      ) : null}
      <Message text={problem} />
    </View>
  );
}

function CountCard({ icon, title, note }: { icon: React.ReactNode; title: string; note: string }) {
  return (
    <View className="min-w-[280px] flex-1 flex-row items-center gap-4 rounded-card border border-line bg-surface px-5 py-4">
      <View className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-warn-soft">
        {icon}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-figtree-extrabold text-[24px] leading-[30px] text-ink">{title}</Text>
        <Text className="font-figtree text-[13px] text-ink-2">{note}</Text>
      </View>
    </View>
  );
}

/** S28: the owner's access manager: who asked, approve or decline, remove access, and the investor view count. */
export function AccessManager({ api, ideaId }: { api: IdeaAccessApi; ideaId: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    async () => ({ cards: await api.requests(ideaId), views: await api.viewCount(ideaId) }),
    attempt,
  );
  const reload = () => setAttempt((a) => a + 1);

  if (loaded.state === "failed") return <ErrorState message={t.interestFailed} onRetry={reload} />;
  if (loaded.state === "loading") return <LoadingRows rows={2} />;

  const { cards, views } = loaded.value;
  const pending = cards.filter((c) => c.status === "pending");
  const withAccess = cards.filter((c) => c.status === "approved" || c.status === "nda_accepted");
  const earlier = cards.filter((c) => !pending.includes(c) && !withAccess.includes(c));
  const card = "min-w-0 gap-3 rounded-card border border-line bg-surface px-6 py-6";
  const row = (c: RequestCard) => (
    <RequestRow key={c.id} card={c} api={api} ideaId={ideaId} onChanged={reload} />
  );

  return (
    <View className="gap-4">
      <Text role="heading" aria-level={2} className="sr-only">
        {t.accessTitle}
      </Text>
      <View className="flex-row flex-wrap gap-4">
        <CountCard
          icon={<Eye size={22} color={palette.navy} aria-hidden />}
          title={t.accessViewedBy(views)}
          note={t.accessViewsNote}
        />
        <CountCard
          icon={<Star size={22} color={palette.navy} aria-hidden />}
          title={t.accessInterested(cards.length)}
          note={t.accessWaitingWith(pending.length, withAccess.length)}
        />
      </View>
      <View className={phone ? "gap-4" : "flex-row items-start gap-4"}>
        <View className={`${card} ${phone ? "" : "flex-[3]"}`}>
          <Text role="heading" aria-level={3} className="font-figtree-bold text-[18px] text-ink">
            {t.accessWaitingTitle}
          </Text>
          {pending.length === 0 ? (
            <Text className="font-figtree text-sm text-ink-2">{t.accessEmpty}</Text>
          ) : (
            pending.map(row)
          )}
          <Text className="font-figtree text-[13px] leading-5 text-ink-2">
            {t.accessDeclineNote}
          </Text>
        </View>
        <View className={`${card} ${phone ? "" : "flex-[2]"}`}>
          <Text role="heading" aria-level={3} className="font-figtree-bold text-[18px] text-ink">
            {t.accessWithTitle}
          </Text>
          {withAccess.length === 0 ? (
            <Text className="font-figtree text-sm text-ink-2">{t.accessNobodyYet}</Text>
          ) : (
            <View className="border-t border-line">{withAccess.map(row)}</View>
          )}
          {earlier.length ? <View className="border-t border-line">{earlier.map(row)}</View> : null}
          <Text className="font-figtree text-[13px] leading-5 text-ink-2">
            {t.accessRemoveNote}
          </Text>
        </View>
      </View>
    </View>
  );
}

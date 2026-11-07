"use client";

import { formatDate, type Strings } from "@kingdom-connect/shared";
import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type {
  InviteCandidate,
  Investor,
  InvestorApplication,
  InvestorsApi,
  TicketBand,
} from "@/lib/investors";
import { useLanguage } from "@/lib/language";
import { Card, Notice, Row } from "./cards";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const BANDS: TicketBand[] = ["under_10m", "10m_to_50m", "over_50m"];
const bandText = (t: Strings, band: TicketBand | null) =>
  band === null
    ? t.accessAnyBand
    : {
        under_10m: t.accessBandUnder10m,
        "10m_to_50m": t.accessBand10mTo50m,
        over_50m: t.accessBandOver50m,
      }[band];

const who = (p: { name: string; username: string }) =>
  p.name ? `${p.name} · @${p.username}` : `@${p.username}`;

type Loaded = { investors: Investor[]; applications: InvestorApplication[] };

function ApplicationCard({
  application,
  api,
  onDone,
}: {
  application: InvestorApplication;
  api: InvestorsApi;
  onDone: () => void;
}) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const decide = async (approve: boolean) => {
    setBusy(true);
    const result = await api.decide(application.id, approve).catch(() => "failed");
    setBusy(false);
    if (result === "ok" || result === "already_decided") onDone();
    else setProblem(t.decideFailed);
  };
  return (
    <Card title={who(application)}>
      <Row
        label={t.investorSectorFocus}
        value={(language === "sw" ? application.sectorSw : application.sectorEn) ?? "–"}
      />
      <Row label={t.investorBandLabel} value={bandText(t, application.band)} />
      {application.note ? <Row label={t.investorNoteLabel} value={application.note} /> : null}
      <Row label={t.adminInvestorApplied} value={formatDate(application.appliedAt, language)} />
      <Notice tone="bad" text={problem} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className={buttonVariants({ variant: "default" })}
        >
          {t.adminInvestorApprove}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.adminInvestorDecline}
        </button>
      </div>
    </Card>
  );
}

function Invite({ api, onDone }: { api: InvestorsApi; onDone: () => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<InviteCandidate[] | null>(null);
  const [band, setBand] = useState<TicketBand | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setNotice(null);
    setFound(await api.search(query).catch(() => []));
  };
  const invite = async (candidate: InviteCandidate) => {
    setBusy(true);
    const result = await api.invite(candidate.memberId, band).catch(() => "failed");
    setBusy(false);
    if (result === "ok") {
      setNotice({ tone: "good", text: t.adminInvestorInvited(who(candidate)) });
      setFound(null);
      setQuery("");
      onDone();
    } else {
      setNotice({ tone: "bad", text: t.decideFailed });
    }
  };

  return (
    <Card title={t.adminInvestorInviteTitle}>
      <p className="text-sm text-ink-2">{t.adminInvestorInviteHint}</p>
      <Field id="investor-search" label={t.adminInvestorSearch} value={query} onChange={setQuery} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-foreground">
          {t.investorBandLabel}
        </legend>
        {BANDS.map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={band === b}
            onClick={() => setBand(band === b ? null : b)}
            className={buttonVariants({ variant: band === b ? "default" : "outline" })}
          >
            {bandText(t, b)}
          </button>
        ))}
      </fieldset>
      <div>
        <button
          type="button"
          disabled={query.trim().length < 2}
          onClick={search}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.adminInvestorFind}
        </button>
      </div>
      {found && found.length === 0 ? (
        <p className="text-sm text-ink-2">{t.adminInvestorNoneFound}</p>
      ) : null}
      {found?.map((candidate) => (
        <div key={candidate.memberId} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-foreground">{who(candidate)}</span>
          {candidate.isInvestor ? (
            <span className="text-sm text-ink-2">{t.adminInvestorAlready}</span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => invite(candidate)}
              className={buttonVariants({ variant: "default" })}
            >
              {t.adminInvestorInvite}
            </button>
          )}
        </div>
      ))}
      <Notice tone={notice?.tone ?? "good"} text={notice?.text ?? null} />
    </Card>
  );
}

function InvestorRow({
  investor,
  api,
  onDone,
}: {
  investor: Investor;
  api: InvestorsApi;
  onDone: () => void;
}) {
  const { t, language } = useLanguage();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Card title={who(investor)}>
      <Row
        label={t.adminInvestorRoute}
        value={
          investor.route === "invitation"
            ? t.adminInvestorByInvitation
            : t.adminInvestorByApplication
        }
      />
      <Row label={t.investorBandLabel} value={bandText(t, investor.band)} />
      <Row
        label={t.adminInvestorGranted}
        value={`${formatDate(investor.grantedAt, language)}${investor.grantedBy ? ` · ${investor.grantedBy}` : ""}`}
      />
      <Notice tone="bad" text={problem} />
      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground">{t.adminInvestorRevokeConfirm}</span>
          <button
            type="button"
            onClick={async () => {
              const result = await api.revoke(investor.memberId).catch(() => "failed");
              if (result === "ok" || result === "not_found") onDone();
              else setProblem(t.decideFailed);
            }}
            className={buttonVariants({ variant: "default" })}
          >
            {t.adminInvestorRevoke}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.cancel}
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.adminInvestorRevoke}
          </button>
        </div>
      )}
    </Card>
  );
}

/** A09 and A10: invite members for the investor flag, decide applications, list and revoke holders (I06). */
export function InvestorsScreen({ api }: { api: InvestorsApi }) {
  const { t } = useLanguage();
  const [state, setState] = useState<"loading" | "failed" | Loaded>("loading");
  const load = useCallback(() => {
    Promise.all([api.investors(), api.applications()])
      .then(([investors, applications]) => setState({ investors, applications }))
      .catch(() => setState("failed"));
  }, [api]);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{t.adminNavMembers}</ScreenTitle>
      <Notice tone="warn" text={t.adminInvestorPrivate} />
      {state === "failed" ? (
        <ErrorState message={t.decideFailed} onRetry={load} />
      ) : state === "loading" ? (
        <LoadingRows />
      ) : (
        <>
          <h2 className="text-lg font-bold text-foreground">{t.adminInvestorApplications}</h2>
          {state.applications.length === 0 ? (
            <p className="text-sm text-ink-2">{t.adminInvestorNoApplications}</p>
          ) : (
            state.applications.map((a) => (
              <ApplicationCard key={a.id} application={a} api={api} onDone={load} />
            ))
          )}
          <Invite api={api} onDone={load} />
          <h2 className="text-lg font-bold text-foreground">{t.adminInvestorHolders}</h2>
          {state.investors.length === 0 ? (
            <EmptyState title={t.adminInvestorNoHolders} message="" />
          ) : (
            state.investors.map((i) => (
              <InvestorRow key={i.memberId} investor={i} api={api} onDone={load} />
            ))
          )}
        </>
      )}
    </div>
  );
}

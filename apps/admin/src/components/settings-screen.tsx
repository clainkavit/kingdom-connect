"use client";

import { MAX_SKILL_LENGTH, staffRoles, type StaffRole } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import type { SettingsApi, StaffMember, Synonym } from "@/lib/settings";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

type Outcome = { tone: "good" | "bad"; text: string } | null;

function Notice({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  return (
    <div
      role={outcome.tone === "good" ? "status" : "alert"}
      className={`rounded-lg px-4 py-3 text-sm font-medium ${outcome.tone === "good" ? "bg-good-soft text-good-text" : "bg-bad-soft text-bad-text"}`}
    >
      {outcome.text}
    </div>
  );
}

const validCap = (text: string) => /^[1-9][0-9]{0,5}$/.test(text.trim());

function CapCard({ api, initial }: { api: SettingsApi; initial: number | null }) {
  const { t } = useLanguage();
  const [on, setOn] = useState(initial !== null);
  const [limit, setLimit] = useState(initial?.toString() ?? "");
  const [result, setResult] = useState<Outcome>(null);

  const save = async () => {
    if (on && !validCap(limit)) return setResult({ tone: "bad", text: t.capInvalid });
    const ok = await api.saveCap(on ? Number(limit.trim()) : null);
    setResult(ok ? { tone: "good", text: t.saved } : { tone: "bad", text: t.saveFailed });
  };

  return (
    <Card title={t.capTitle}>
      <p className="text-sm text-ink-2">{t.capHint}</p>
      <label className="flex min-h-[40px] items-center gap-3 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="size-4 accent-[var(--kc-blue)]"
        />
        {t.capOn}
      </label>
      {on ? (
        <Field id="cap-limit" label={t.capLimit} value={limit} onChange={setLimit} type="number" />
      ) : null}
      <Notice outcome={result} />
      <div>
        <button type="button" onClick={save} className={buttonVariants({ variant: "default" })}>
          {t.save}
        </button>
      </div>
    </Card>
  );
}

function StaffCard({
  api,
  staff,
  onChanged,
}: {
  api: SettingsApi;
  staff: StaffMember[];
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("admin");
  const [result, setResult] = useState<Outcome>(null);
  const roleLabel = (r: StaffRole) => (r === "admin" ? t.roleAdmin : t.roleSuperAdmin);

  const invite = async () => {
    const sentTo = email.trim();
    const outcome = await api.invite({ fullName: fullName.trim(), email: sentTo, role });
    if (outcome === "done") {
      setFullName("");
      setEmail("");
      setResult({ tone: "good", text: t.inviteSent(sentTo) });
      onChanged();
    } else
      setResult({
        tone: "bad",
        text:
          outcome === "email_taken"
            ? t.inviteEmailTaken
            : outcome === "invalid"
              ? t.inviteInvalid
              : t.saveFailed,
      });
  };

  const setActive = async (member: StaffMember) => {
    const outcome = await api.setActive(member.id, !member.active);
    if (outcome === "done") {
      setResult(null);
      onChanged();
    } else setResult({ tone: "bad", text: outcome === "refused" ? t.staffRefused : t.saveFailed });
  };

  return (
    <Card title={t.staffTitle}>
      <ul className="flex flex-col divide-y rounded-lg border">
        {staff.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold text-foreground">{member.fullName}</span>
              <span className="text-[13px] text-ink-2">
                {roleLabel(member.role)}
                {member.active ? "" : ` · ${t.staffInactive}`}
              </span>
            </span>
            <button
              type="button"
              aria-label={`${member.active ? t.deactivate : t.reactivate} ${member.fullName}`}
              onClick={() => setActive(member)}
              className={buttonVariants({ variant: member.active ? "outline" : "secondary" })}
            >
              {member.active ? t.deactivate : t.reactivate}
            </button>
          </li>
        ))}
      </ul>
      <Notice outcome={result} />
      <h3 className="pt-2 text-sm font-semibold text-foreground">{t.staffInvite}</h3>
      <Field id="staff-name" label={t.staffName} value={fullName} onChange={setFullName} />
      <Field id="staff-email" label={t.staffEmail} value={email} onChange={setEmail} type="email" />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-semibold text-foreground">{t.staffRole}</legend>
        {staffRoles.map((r) => (
          <label key={r} className="flex min-h-[40px] items-center gap-2 text-sm">
            <input
              type="radio"
              name="staff-role"
              checked={role === r}
              onChange={() => setRole(r)}
              className="size-4 accent-[var(--kc-blue)]"
            />
            {roleLabel(r)}
          </label>
        ))}
      </fieldset>
      <div>
        <button type="button" onClick={invite} className={buttonVariants({ variant: "default" })}>
          {t.sendInvite}
        </button>
      </div>
    </Card>
  );
}

function SynonymsCard({ api }: { api: SettingsApi }) {
  const { t } = useLanguage();
  const [list, setList] = useState<Synonym[] | null>(null);
  const [variant, setVariant] = useState("");
  const [skill, setSkill] = useState("");
  const [result, setResult] = useState<Outcome>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.synonyms().then(
      (loaded) => live && setList(loaded),
      () => live && setResult({ tone: "bad", text: t.saveFailed }),
    );
    return () => {
      live = false;
    };
  }, [api, attempt, t]);

  const add = async () => {
    const outcome = await api.addSynonym(variant, skill);
    if (outcome === "done") {
      setVariant("");
      setSkill("");
      setAttempt((a) => a + 1);
    }
    setResult({
      tone: outcome === "done" ? "good" : "bad",
      text: {
        done: t.synonymAdded,
        same: t.synonymSame,
        exists: t.synonymExists,
        invalid: t.synonymInvalid(MAX_SKILL_LENGTH),
        failed: t.saveFailed,
      }[outcome],
    });
  };

  const remove = async (synonym: Synonym) => {
    if (await api.removeSynonym(synonym.id)) setAttempt((a) => a + 1);
    else setResult({ tone: "bad", text: t.saveFailed });
  };

  return (
    <Card title={t.synonymsTitle}>
      <p className="text-sm text-ink-2">{t.synonymsHint}</p>
      {list && list.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {list.map((synonym) => (
            <li key={synonym.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-sm text-foreground">
                {synonym.fromName} → {synonym.skillName}
              </span>
              <button
                type="button"
                aria-label={t.removeSynonym(synonym.fromName)}
                onClick={() => remove(synonym)}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : list ? (
        <p className="text-sm text-ink-2">{t.noSynonyms}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="synonym-variant"
          label={t.synonymVariant}
          value={variant}
          onChange={setVariant}
        />
        <Field id="synonym-skill" label={t.synonymSkill} value={skill} onChange={setSkill} />
      </div>
      <Notice outcome={result} />
      <div>
        <button type="button" onClick={add} className={buttonVariants({ variant: "default" })}>
          {t.addSynonym}
        </button>
      </div>
    </Card>
  );
}

type Loaded = { cap: number | null; staff: StaffMember[] };

export function SettingsScreen({ api, superAdmin }: { api: SettingsApi; superAdmin: boolean }) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!superAdmin) return;
    let live = true;
    Promise.all([api.cap(), api.staff()]).then(
      ([cap, staff]) => live && setLoaded({ cap, staff }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, superAdmin, attempt]);

  const reload = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };

  return (
    <>
      <ScreenTitle>{t.adminNavSettings}</ScreenTitle>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {!superAdmin ? (
          <EmptyState title={t.adminNavSettings} message={t.settingsSuperAdminOnly} />
        ) : failed ? (
          <ErrorState message={t.saveFailed} onRetry={reload} />
        ) : !loaded ? (
          <LoadingRows />
        ) : (
          <>
            <CapCard key={String(loaded.cap)} api={api} initial={loaded.cap} />
            <StaffCard api={api} staff={loaded.staff} onChanged={reload} />
          </>
        )}
        <SynonymsCard api={api} />
      </div>
    </>
  );
}

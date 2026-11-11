"use client";

import {
  formatDate,
  MAX_SKILL_LENGTH,
  staffRoles,
  type StaffRole,
  type Strings,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import type {
  LegalKind,
  LegalVersion,
  MatchingFeature,
  PlatformKey,
  PlatformResult,
  PlatformSettings,
  SettingsApi,
  StaffMember,
  Synonym,
  Weight,
} from "@/lib/settings";
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

/** Loads one card's data once, with a retry. */
function useLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (loaded) => live && setValue(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [load, attempt]);
  const retry = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };
  return { value, failed, retry };
}

function platformMessage(t: Strings, result: PlatformResult): Outcome {
  if (result === "ok") return { tone: "good", text: t.saved };
  if (result === "unchanged") return { tone: "good", text: t.platformUnchanged };
  if (result === "invalid_value") return { tone: "bad", text: t.platformInvalid };
  if (result === "not_super_admin") return { tone: "bad", text: t.settingsSuperAdminOnly };
  return { tone: "bad", text: t.saveFailed };
}

function PlatformCard({ api, initial }: { api: SettingsApi; initial: PlatformSettings }) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial.platformName);
  const [entity, setEntity] = useState(initial.legalEntityName);
  const [slots, setSlots] = useState(String(initial.featuredSlotLimit));
  const [saved, setSaved] = useState(initial);
  const [result, setResult] = useState<Outcome>(null);

  const save = async () => {
    const changes: [PlatformKey, string | number][] = [];
    if (name.trim() !== saved.platformName) changes.push(["platform_name", name.trim()]);
    if (entity.trim() !== saved.legalEntityName) changes.push(["legal_entity_name", entity.trim()]);
    if (slots.trim() !== String(saved.featuredSlotLimit)) {
      if (!/^\d{1,2}$/.test(slots.trim())) return setResult(platformMessage(t, "invalid_value"));
      changes.push(["featured_slot_limit", Number(slots.trim())]);
    }
    if (changes.length === 0) return setResult(platformMessage(t, "unchanged"));
    for (const [key, value] of changes) {
      const outcome = await api.savePlatform(key, value);
      if (outcome !== "ok" && outcome !== "unchanged")
        return setResult(platformMessage(t, outcome));
      setSaved((before) => ({
        ...before,
        ...(key === "platform_name" ? { platformName: String(value) } : {}),
        ...(key === "legal_entity_name" ? { legalEntityName: String(value) } : {}),
        ...(key === "featured_slot_limit" ? { featuredSlotLimit: Number(value) } : {}),
      }));
    }
    setResult(platformMessage(t, "ok"));
  };

  return (
    <Card title={t.platformTitle}>
      <Field id="platform-name" label={t.platformName} value={name} onChange={setName} />
      <Field id="platform-entity" label={t.platformEntity} value={entity} onChange={setEntity} />
      <Field
        id="platform-slots"
        label={t.platformSlots}
        value={slots}
        onChange={setSlots}
        type="number"
      />
      <p className="text-[13px] text-ink-2">{t.platformHint}</p>
      <Notice outcome={result} />
      <div>
        <button type="button" onClick={save} className={buttonVariants({ variant: "default" })}>
          {t.savePlatform}
        </button>
      </div>
    </Card>
  );
}

const signalLabel = (t: Strings, signal: string): string =>
  ({
    skill_each: t.weightSkillEach,
    skill_max: t.weightSkillMax,
    mutual_each: t.weightMutualEach,
    mutual_max: t.weightMutualMax,
    sector: t.weightSector,
    location_district: t.weightDistrict,
    location_region: t.weightRegion,
    location_remote: t.weightRemote,
    profession: t.weightProfession,
    study: t.weightStudy,
    minimum: t.weightMinimum,
  })[signal] ?? signal;

const SIGNAL_ORDER = [
  "skill_each",
  "skill_max",
  "mutual_each",
  "mutual_max",
  "sector",
  "profession",
  "study",
  "location_district",
  "location_region",
  "location_remote",
  "minimum",
];
const bySignal = (a: Weight, b: Weight) =>
  SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal);

const isCount = (signal: string) => signal === "skill_max" || signal === "mutual_max";
const weightKey = (w: { feature: MatchingFeature; signal: string }) => `${w.feature}.${w.signal}`;

function WeightsCard({ api, initial }: { api: SettingsApi; initial: Weight[] }) {
  const { t } = useLanguage();
  const [saved, setSaved] = useState(initial);
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((w) => [weightKey(w), String(w.points)])),
  );
  const [result, setResult] = useState<Outcome>(null);
  const features: { feature: MatchingFeature; title: string }[] = [
    { feature: "scan", title: t.weightsScan },
    { feature: "people", title: t.weightsPeople },
  ];

  const save = async () => {
    const changed = saved.filter((w) => (typed[weightKey(w)] ?? "").trim() !== String(w.points));
    for (const w of changed) {
      const text = (typed[weightKey(w)] ?? "").trim();
      const points = Number(text);
      const ok =
        /^\d{1,3}$/.test(text) && (isCount(w.signal) ? points >= 1 && points <= 10 : points <= 100);
      if (!ok) return setResult({ tone: "bad", text: t.weightInvalid(signalLabel(t, w.signal)) });
    }
    for (const w of changed) {
      const points = Number((typed[weightKey(w)] ?? "").trim());
      const outcome = await api.saveWeight({ ...w, points });
      if (outcome !== "ok")
        return setResult({
          tone: "bad",
          text:
            outcome === "invalid_points"
              ? t.weightInvalid(signalLabel(t, w.signal))
              : outcome === "not_super_admin"
                ? t.settingsSuperAdminOnly
                : t.saveFailed,
        });
      setSaved((list) => list.map((x) => (weightKey(x) === weightKey(w) ? { ...w, points } : x)));
    }
    setResult({ tone: "good", text: changed.length ? t.saved : t.platformUnchanged });
  };

  return (
    <Card title={t.weightsTitle}>
      <p className="text-sm text-ink-2">{t.weightsHint}</p>
      {features.map(({ feature, title }) => (
        <fieldset key={feature} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">{title}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {saved
              .filter((w) => w.feature === feature)
              .sort(bySignal)
              .map((w) => (
                <Field
                  key={w.signal}
                  id={`weight-${feature}-${w.signal}`}
                  label={signalLabel(t, w.signal)}
                  type="number"
                  value={typed[weightKey(w)] ?? ""}
                  onChange={(v) => setTyped((all) => ({ ...all, [weightKey(w)]: v }))}
                />
              ))}
          </div>
        </fieldset>
      ))}
      <Notice outcome={result} />
      <div>
        <button type="button" onClick={save} className={buttonVariants({ variant: "default" })}>
          {t.saveWeights}
        </button>
      </div>
    </Card>
  );
}

const legalName = (t: Strings, kind: LegalKind): string =>
  ({
    terms: t.legalTerms,
    privacy: t.legalPrivacy,
    nda: t.legalNda,
    ip: t.legalIp,
    handoff: t.legalHandoff,
  })[kind];

const LEGAL_ORDER: LegalKind[] = ["terms", "privacy", "nda", "ip", "handoff"];

function LegalVersionsCard({ versions }: { versions: LegalVersion[] }) {
  const { t, language } = useLanguage();
  const ordered = [...versions].sort(
    (a, b) => LEGAL_ORDER.indexOf(a.kind) - LEGAL_ORDER.indexOf(b.kind),
  );
  const day = (d: Date | null) => (d ? formatDate(d, language) : t.notGiven);
  return (
    <Card title={t.legalVersionsTitle}>
      <p className="text-sm text-ink-2">{t.legalVersionsHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b text-[13px] text-ink-2">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t.legalVersionsText}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t.legalVersionsVersion}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t.legalVersionsApproved}
              </th>
              <th scope="col" className="py-2 font-semibold">
                {t.legalVersionsEffective}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ordered.map((v) => (
              <tr key={`${v.kind}-${v.version}`}>
                <td className="py-2.5 pr-3 text-foreground">{legalName(t, v.kind)}</td>
                <td className="py-2.5 pr-3 text-foreground">
                  {v.version}
                  {v.current ? (
                    <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-[12px] font-semibold text-good-text">
                      {t.legalVersionsCurrent}
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3 text-ink-2">{day(v.approvedAt)}</td>
                <td className="py-2.5 text-ink-2">{day(v.effectiveAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** A Super Administrator's card that loads its own data. */
function LoadedCard<T>({
  load,
  children,
}: {
  load: () => Promise<T>;
  children: (value: T) => React.ReactNode;
}) {
  const { t } = useLanguage();
  const { value, failed, retry } = useLoad(load);
  if (failed) return <ErrorState message={t.settingsLoadFailed} onRetry={retry} />;
  if (value === null) return <LoadingRows rows={2} />;
  return <>{children(value)}</>;
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
        {superAdmin ? (
          <>
            <LoadedCard load={api.platform}>
              {(platform) => <PlatformCard api={api} initial={platform} />}
            </LoadedCard>
            <LoadedCard load={api.weights}>
              {(weights) => <WeightsCard api={api} initial={weights} />}
            </LoadedCard>
            <LoadedCard load={api.legalVersions}>
              {(versions) => (
                <div className="lg:col-span-2">
                  <LegalVersionsCard versions={versions} />
                </div>
              )}
            </LoadedCard>
          </>
        ) : null}
        <SynonymsCard api={api} />
      </div>
    </>
  );
}

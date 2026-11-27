import { formatDateTime, type Language, type Strings } from "@kingdom-connect/shared";
import type { AuditEntry, AuditNames } from "./audit";

/** One changed value, in words. `from` is null for a new record or a value that was empty. */
export type PlainChange = { field: string; label: string; from: string | null; to: string | null };

/** An entry in plain words. Names in `sentence` are wrapped in ** so the screen can make them bold. */
export type PlainEntry = { sentence: string; changes: PlainChange[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const HIDDEN = new Set(["id", "created_at", "updated_at"]);
const hidden = (field: string) => HIDDEN.has(field) || field.endsWith("_path");

type Row = Record<string, unknown>;

const row = (e: AuditEntry): Row => ({ ...e.before, ...e.after });

/** Every id in the entries that may name a person or a thing, for one names lookup. */
export function idsIn(entries: AuditEntry[]): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.targetId) ids.add(e.targetId);
    for (const v of Object.values({ ...e.before, ...e.after }))
      if (typeof v === "string" && UUID.test(v)) ids.add(v);
  }
  return [...ids];
}

export function plainValue(
  value: unknown,
  names: AuditNames,
  t: Strings,
  language: Language,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return t.auditWord(String(value));
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (UUID.test(value)) return names.get(value) ?? `${value.slice(0, 8)}…`;
    if (TIMESTAMP.test(value)) return formatDateTime(new Date(value), language);
    return t.auditWord(value);
  }
  if (Array.isArray(value))
    return value.map((v) => plainValue(v, names, t, language) ?? "").join(", ");
  return JSON.stringify(value);
}

export function plainChanges(
  e: AuditEntry,
  names: AuditNames,
  t: Strings,
  language: Language,
): PlainChange[] {
  const isNew = !e.before;
  const fields = [...new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})])];
  return fields
    .filter((f) => !hidden(f))
    .filter((f) => JSON.stringify(e.before?.[f]) !== JSON.stringify(e.after?.[f]))
    .filter((f) => !(isNew && (e.after?.[f] === null || e.after?.[f] === undefined)))
    .map((f) => ({
      field: f,
      label:
        f === "value" && typeof row(e).key === "string"
          ? t.auditSetting(row(e).key as string)
          : t.auditField(f),
      from: plainValue(e.before?.[f], names, t, language),
      to: plainValue(e.after?.[f], names, t, language),
    }));
}

/** The sentence and the changed values of one entry, in the reader's language. */
export function describe(
  e: AuditEntry,
  names: AuditNames,
  t: Strings,
  language: Language,
): PlainEntry {
  const r = row(e);
  const bold = (text: string) => `**${text}**`;
  const name = (id: unknown) =>
    typeof id === "string" && names.has(id) ? bold(names.get(id)!) : bold(t.auditAMember);
  const thing = (id: unknown, fallback?: unknown) =>
    typeof id === "string" && names.has(id)
      ? bold(names.get(id)!)
      : typeof fallback === "string"
        ? bold(fallback)
        : "";
  const word = (v: unknown) => plainValue(v, names, t, language) ?? t.auditEmptyValue;
  const a =
    e.actorKind === "system"
      ? bold(t.auditTheSystem)
      : bold(e.actorName || t.auditDeletedActor(e.actorId ?? ""));
  const member = r.member_id ?? (e.targetType === "members" ? e.targetId : null);
  const level = String(r.level ?? 1);
  const op = e.action.split(".").pop();
  const table = e.action.split(".")[0]!;
  const changes = plainChanges(e, names, t, language);

  const sentence = ((): string => {
    switch (e.action) {
      case "application.approved":
        return t.auditSayApproved(a, name(member), level);
      case "application.rejected":
        return t.auditSayRejected(a, name(member));
      case "application.reopened":
        return t.auditSayReopened(a, name(member));
      case "application.duplicate_marked":
        return t.auditSayDuplicateMarked(a, name(r.duplicate_suspected_of));
      case "application.resubmission_started":
        return t.auditSayResubmission(name(e.targetId));
      case "registration.duplicate_id":
        return t.auditSayDuplicateId(name(r.duplicate_of));
      case "id.revealed":
        return t.auditSayIdRevealed(a, name(e.targetId));
      case "investor_flags.insert":
        return t.auditSayInvestorGranted(a, name(member), word(r.route));
      case "investor_flags.update":
        return e.after?.revoked_at && !e.before?.revoked_at
          ? t.auditSayInvestorRevoked(a, name(member))
          : t.auditSayInvestorUpdated(a, name(member));
      case "platform_settings.insert":
      case "platform_settings.update": {
        const key = String(r.key ?? "");
        return e.routine
          ? t.auditSayJobRan(t.auditSetting(key))
          : t.auditSaySettingChanged(a, t.auditSetting(key));
      }
      case "members.update":
        if (e.before?.status !== e.after?.status)
          return t.auditSayAccountStatus(
            name(e.targetId),
            word(e.before?.status),
            word(e.after?.status),
          );
        if (e.after?.posting_suspended_until)
          return t.auditSayPostingPaused(name(e.targetId), word(e.after.posting_suspended_until));
        return t.auditSayAccountUpdated(name(e.targetId));
      case "staff.insert":
        return t.auditSayStaffAdded(a, bold(String(r.full_name)), word(r.role));
      case "staff.update":
        return e.before?.active === true && e.after?.active === false
          ? t.auditSayStaffDeactivated(a, bold(String(r.full_name)))
          : t.auditSayStaffChanged(a, bold(String(r.full_name)));
      case "login.locked":
        return t.auditSayLocked(String(r.failed_count ?? ""));
      case "login.unlocked":
        return t.auditSayUnlocked(a, name(e.targetId));
      case "password.reset":
        return t.auditSayPasswordSet(name(e.targetId));
      case "staff.reset_requested":
        return t.auditSayResetAsked(name(e.targetId));
      case "staff.reset_sent":
        return t.auditSayResetSent(a, name(e.targetId));
      case "business.verification_submitted":
        return t.auditSayBusinessSubmitted(a, thing(r.business_id));
      case "business.verification_approved":
        return t.auditSayBusinessVerified(a, thing(r.business_id), level);
      case "business.verification_rejected":
        return t.auditSayBusinessRefused(a, thing(r.business_id));
      case "business.renewal_submitted":
        return t.auditSayRenewalSubmitted(a, thing(r.business_id));
      case "business.renewal_approved":
        return t.auditSayRenewalApproved(a, thing(r.business_id));
      case "business.renewal_rejected":
        return t.auditSayRenewalRefused(a, thing(r.business_id));
      case "businesses.insert":
        return t.auditSayBusinessAdded(name(r.member_id), thing(e.targetId, r.name));
      case "businesses.update":
        return e.before?.status !== e.after?.status
          ? t.auditSayBusinessStatus(thing(e.targetId, r.name), word(e.after?.status))
          : t.auditSayBusinessUpdated(thing(e.targetId, r.name));
      case "opportunity.sent":
        return t.auditSayOpportunitySent(a, thing(e.targetId));
      case "opportunity.approve":
        return t.auditSayOpportunityApproved(a, thing(e.targetId));
      case "opportunity.feature":
        return t.auditSayOpportunityFeatured(a, thing(e.targetId));
      case "opportunity.unfeature":
        return t.auditSayOpportunityUnfeatured(a, thing(e.targetId));
      case "opportunities.update":
        return t.auditSayOpportunityStatus(thing(e.targetId, r.title), word(e.after?.status));
      case "ideas.insert":
        return t.auditSayIdeaShared(name(r.owner_id), thing(e.targetId, r.title));
      case "idea_views.detail":
        return t.auditSayIdeaOpened(a, thing(e.targetId));
      case "moderation_actions.insert":
        return t.auditSayModeration(a, word(r.action));
      case "reports.update":
        return t.auditSayReportDecided(a, String(r.reference_no ?? ""));
      case "matching_settings.insert":
      case "matching_settings.update":
        return t.auditSayMatching(a, `“${r.feature} / ${r.signal}”`, String(r.points ?? ""));
      case "skill_synonyms.insert":
        return t.auditSaySpellingMerged(a, String(r.from_name ?? ""));
      case "skill_synonyms.delete":
        return t.auditSaySpellingRemoved(a, String(r.from_name ?? ""));
      case "member.email_changed":
        return t.auditSayEmailChanged(a);
      case "member.phone_changed":
        return t.auditSayPhoneChanged(a);
      case "member.address_changed":
        return t.auditSayAddressChanged(a);
      case "member.data_deleted":
        return t.auditSayDataDeleted;
      case "recovery.requested":
        return t.auditSayRecoveryAsked(name(r.member_id));
      case "recovery.applied":
        return t.auditSayRecoveryApplied;
    }
    const what = t.auditThing(table);
    if (op === "insert") return t.auditSayAdded(a, what);
    if (op === "delete") return t.auditSayRemoved(a, what);
    return t.auditSayChanged(a, what);
  })();

  return { sentence, changes };
}

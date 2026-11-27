import { stringsFor } from "@kingdom-connect/shared";
import { describe as group, expect, it } from "vitest";
import type { AuditEntry } from "./audit";
import { describe, idsIn, plainChanges } from "./audit-plain";

const en = stringsFor("en");
const sw = stringsFor("sw");

const CHAMPION = "250db91a-ebf1-4895-ad75-7376041985b8";
const NEEMA = "38131840-805c-48c0-aef9-e3669fd9b7c4";
const FLAG = "a3dc94f6-183a-4d44-9c79-b0e8f5eb71f3";
const BIZ = "5d2a7e91-0b3c-4f18-a6e2-9c4b1d7f0a55";
const names = new Map([
  [CHAMPION, "Champion Joseph"],
  [NEEMA, "Neema Mushi"],
  [BIZ, "Mwanza Fresh Produce"],
]);

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "e1",
  at: new Date("2026-11-27T08:16:00+03:00"),
  cursor: { createdAt: "2026-11-27T05:16:00+00:00", id: "e1" },
  actorKind: "staff",
  actorId: CHAMPION,
  actorName: "Champion Joseph",
  action: "investor_flags.insert",
  targetType: "investor_flags",
  targetId: FLAG,
  before: null,
  after: {
    id: FLAG,
    route: "invitation",
    member_id: NEEMA,
    granted_at: "2026-11-27T05:16:13.102033+00:00",
    granted_by: CHAMPION,
    revoked_at: null,
    ticket_band: null,
    sector_focus: null,
    created_at: "2026-11-27T05:16:13+00:00",
  },
  ip: "50.7.252.189",
  kind: "investors",
  routine: false,
  ...over,
});

const say = (e: AuditEntry, t = en) => describe(e, names, t, t === en ? "en" : "sw").sentence;

group("describe", () => {
  it("turns an investor flag into a sentence with names", () => {
    expect(say(entry())).toBe(
      "**Champion Joseph** made **Neema Mushi** an investor, by invitation",
    );
    expect(say(entry(), sw)).toBe(
      "**Champion Joseph** alimfanya **Neema Mushi** kuwa mwekezaji, kwa mwaliko",
    );
  });

  it("lists a new record's values in words, without ids, empty values or row times", () => {
    const changes = plainChanges(entry(), names, en, "en");
    expect(changes.map((c) => c.label)).toEqual(["How", "Member", "Given on", "Given by"]);
    expect(changes.find((c) => c.field === "granted_by")).toEqual({
      field: "granted_by",
      label: "Given by",
      from: null,
      to: "Champion Joseph",
    });
    expect(changes.find((c) => c.field === "granted_at")!.to).toMatch(/27 November 2026.*08:16/);
  });

  it("says a routine job ran, by its plain name", () => {
    const job = entry({
      actorKind: "system",
      actorId: null,
      actorName: "",
      action: "platform_settings.update",
      targetType: "platform_settings",
      before: { key: "job_alerts_last_run", value: "2026-11-26 04:00:00+00" },
      after: { key: "job_alerts_last_run", value: "2026-11-27 04:00:00+00" },
      kind: "settings",
      routine: true,
    });
    expect(say(job)).toBe("The job alerts email ran");
    expect(plainChanges(job, names, en, "en")[0]!.label).toBe("job alerts email");
  });

  it("names the setting a person changed, with before and after", () => {
    const setting = entry({
      action: "platform_settings.update",
      targetType: "platform_settings",
      before: { key: "daily_application_cap", value: null },
      after: { key: "daily_application_cap", value: 40 },
      kind: "settings",
    });
    expect(say(setting)).toBe("**Champion Joseph** changed the setting “Daily application limit”");
    expect(plainChanges(setting, names, en, "en")).toEqual([
      { field: "value", label: "Daily application limit", from: null, to: "40" },
    ]);
  });

  it("describes decisions on applications, accounts and businesses", () => {
    expect(
      say(
        entry({
          action: "application.approved",
          after: { status: "approved", level: 1, member_id: NEEMA },
          before: { status: "pending" },
        }),
      ),
    ).toBe("**Champion Joseph** approved **Neema Mushi**'s application, Level 1");
    expect(
      say(
        entry({
          actorKind: "system",
          action: "members.update",
          targetType: "members",
          targetId: NEEMA,
          before: { status: "approved" },
          after: { status: "suspended" },
        }),
      ),
    ).toBe("**Neema Mushi**'s account went from approved to suspended");
    expect(
      say(
        entry({
          action: "business.verification_approved",
          after: { business_id: BIZ, level: 2, status: "approved" },
        }),
      ),
    ).toBe("**Champion Joseph** verified **Mwanza Fresh Produce**, Level 2");
  });

  it("describes public listings and the daily import", () => {
    expect(
      say(
        entry({
          action: "public_listing.approved",
          after: { status: "approved", title: "Supply of ICT equipment", source: "NeST" },
        }),
      ),
    ).toBe("**Champion Joseph** approved the public listing **Supply of ICT equipment** from NeST");
    expect(
      say(
        entry({
          actorKind: "system",
          action: "public_listings.imported",
          after: { source: "NeST", found: 209 },
          routine: true,
        }),
      ),
    ).toBe("The daily import read 209 listings from **NeST**");
  });

  it("falls back to the kind of record for an action it does not know", () => {
    expect(say(entry({ action: "plan_documents.insert", targetType: "plan_documents" }))).toBe(
      "**Champion Joseph** added a plan document",
    );
    expect(say(entry({ action: "new_things.delete", targetType: "new_things" }))).toBe(
      "**Champion Joseph** removed a new things record",
    );
    expect(say(entry({ action: "new_things.update" }), sw)).toBe(
      "**Champion Joseph** alibadilisha rekodi ya new things",
    );
  });

  it("names a member it cannot find as a member, and a deleted actor by id", () => {
    expect(say(entry({ after: { route: "application", member_id: FLAG } }))).toBe(
      "**Champion Joseph** made **a member** an investor, by application",
    );
    expect(say(entry({ actorName: "", actorId: "m7" }))).toMatch(/^\*\*Deleted account m7\*\*/);
  });
});

group("idsIn", () => {
  it("collects the target and every id in the values, once", () => {
    expect(idsIn([entry(), entry()]).sort()).toEqual([CHAMPION, NEEMA, FLAG].sort());
  });
});

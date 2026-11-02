import { describe, expect, it, vi } from "vitest";
import { createVerificationClient, isOverdue, waitingAge, workingDaysSince } from "./verification";

const eat = (local: string) => new Date(`${local}+03:00`);

describe("workingDaysSince", () => {
  it("counts the Monday to Friday days after the submission day, in Tanzania time", () => {
    expect(workingDaysSince(eat("2026-11-02T10:00"), eat("2026-11-02T17:00"))).toBe(0);
    expect(workingDaysSince(eat("2026-11-02T10:00"), eat("2026-11-03T09:00"))).toBe(1);
    expect(workingDaysSince(eat("2026-11-02T10:00"), eat("2026-11-04T09:00"))).toBe(2);
  });

  it("skips the weekend", () => {
    expect(workingDaysSince(eat("2026-11-06T16:00"), eat("2026-11-09T08:00"))).toBe(1);
    expect(workingDaysSince(eat("2026-11-07T12:00"), eat("2026-11-09T08:00"))).toBe(1);
  });

  it("uses the Tanzanian date, not the UTC one", () => {
    expect(workingDaysSince(eat("2026-11-02T23:30"), eat("2026-11-03T01:00"))).toBe(1);
  });
});

describe("isOverdue", () => {
  it("flags an application that has waited 2 working days", () => {
    expect(isOverdue(eat("2026-11-06T16:00"), eat("2026-11-09T12:00"))).toBe(false);
    expect(isOverdue(eat("2026-11-06T16:00"), eat("2026-11-10T08:00"))).toBe(true);
  });
});

describe("waitingAge", () => {
  it("gives hours under a day and whole days after", () => {
    const now = eat("2026-11-05T12:00");
    expect(waitingAge(eat("2026-11-05T11:40"), now)).toEqual({ unit: "hours", value: 0 });
    expect(waitingAge(eat("2026-11-05T02:00"), now)).toEqual({ unit: "hours", value: 10 });
    expect(waitingAge(eat("2026-11-02T10:00"), now)).toEqual({ unit: "days", value: 3 });
  });
});

describe("createVerificationClient", () => {
  const reply = (body: object) =>
    vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) }) as unknown as typeof fetch;
  const client = (body: object) =>
    createVerificationClient({ url: "http://x", anonKey: "k", fetch: reply(body) });

  it("sends a decision with the staff token", async () => {
    const fetch = reply({ ok: true });
    const result = await createVerificationClient({ url: "http://x", anonKey: "k", fetch }).decide(
      "tok",
      { requestId: "r", decision: "rejected", reasonCode: "id_expired", note: "" },
    );
    expect(result).toEqual({ kind: "done" });
    expect(fetch).toHaveBeenCalledWith(
      "http://x/functions/v1/decide-application",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("reports why a decision was refused", async () => {
    const decision = { requestId: "r", decision: "approved" as const };
    expect(await client({ error: "already_decided" }).decide("t", decision)).toEqual({
      kind: "already_decided",
    });
    expect(await client({ error: "reason_required" }).decide("t", decision)).toEqual({
      kind: "reason_required",
    });
    expect(await client({ error: "note_has_contact_details" }).decide("t", decision)).toEqual({
      kind: "note_has_contact_details",
    });
    expect(await client({ error: "member_not_pending" }).decide("t", decision)).toEqual({
      kind: "member_not_pending",
    });
    expect(await client({ error: "boom" }).decide("t", decision)).toEqual({ kind: "failed" });
  });

  it("marks a duplicate and says when the username is unknown", async () => {
    expect(await client({ ok: true }).markDuplicate("t", "r", "someone")).toEqual({
      kind: "done",
    });
    expect(await client({ error: "unknown_member" }).markDuplicate("t", "r", "x")).toEqual({
      kind: "unknown_member",
    });
  });

  it("reveals an ID number", async () => {
    expect(await client({ idNumber: "AB12345" }).revealIdNumber("t", "m")).toBe("AB12345");
    expect(await client({ error: "not_found" }).revealIdNumber("t", "m")).toBeNull();
  });

  it("reopens a final rejection with a note", async () => {
    expect(await client({ ok: true }).reopen("t", "r", "New photo")).toBe("done");
    expect(await client({ error: "note_required" }).reopen("t", "r", "")).toBe("note_required");
    expect(await client({ error: "not_final" }).reopen("t", "r", "x")).toBe("not_final");
    expect(await client({ error: "boom" }).reopen("t", "r", "x")).toBe("failed");
  });
});

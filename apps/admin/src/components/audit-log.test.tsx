import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changedFields, type AuditApi, type AuditEntry } from "@/lib/audit";
import { AuditLog } from "./audit-log";

afterEach(cleanup);

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "e1",
  at: new Date("2026-11-03T09:00:00+03:00"),
  cursor: { createdAt: "2026-11-03T06:00:00.123456+00:00", id: "e1" },
  actorKind: "staff",
  actorId: "s9",
  actorName: "Test Administrator",
  action: "reports.update",
  targetType: "reports",
  targetId: "r1",
  before: { status: "open", note: "x", updated_at: "a" },
  after: { status: "action_taken", note: "x", updated_at: "b" },
  ip: "10.0.0.1",
  ...over,
});

const fakeApi = (over: Partial<AuditApi> = {}): AuditApi => ({
  page: vi.fn().mockResolvedValue([]),
  actions: vi.fn().mockResolvedValue(["members.update", "reports.update"]),
  staff: vi.fn().mockResolvedValue([{ id: "s1", name: "Other Administrator" }]),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(api: AuditApi, superAdmin = true) {
  await act(async () => {
    render(<AuditLog api={api} superAdmin={superAdmin} />);
  });
}

describe("changedFields", () => {
  it("lists only the fields that changed, without timestamps", () => {
    expect(changedFields(entry().before, entry().after)).toEqual([
      { field: "status", from: "open", to: "action_taken" },
    ]);
  });

  it("lists every field of a new row", () => {
    expect(changedFields(null, { reason: "spam", count: 2 })).toEqual([
      { field: "reason", to: "spam" },
      { field: "count", to: "2" },
    ]);
  });

  it("tells a removed field from one set to null, and text from a number", () => {
    expect(changedFields({ a: "x", b: "x", c: "5" }, { b: null, c: 5 })).toEqual([
      { field: "a", from: "x" },
      { field: "b", from: "x", to: "null" },
      { field: "c", from: "5", to: "5" },
    ]);
  });
});

describe("AuditLog (A13)", () => {
  it("is for Super Admins only", async () => {
    const api = fakeApi();
    await show(api, false);
    expect(screen.getByText("Only Super Admins can open the audit log.")).toBeTruthy();
    expect(api.page).not.toHaveBeenCalled();
  });

  it("shows each entry with the actor, the action, the changed fields and the IP", async () => {
    await show(fakeApi({ page: vi.fn().mockResolvedValue([entry()]) }));
    const log = within(screen.getByRole("list", { name: "Audit log" }));
    expect(log.getByText("reports.update")).toBeTruthy();
    expect(log.getByText(/Test Administrator/)).toBeTruthy();
    expect(log.getByText("status: open → action_taken")).toBeTruthy();
    expect(log.getByText(/10\.0\.0\.1/)).toBeTruthy();
    expect(log.queryByText(/"note"/)).toBeNull();
    await click("Show full record");
    expect(log.getAllByText(/"note": "x"/)).toHaveLength(2);
  });

  it("filters by staff, username, system, action and dates", async () => {
    const api = fakeApi();
    await show(api);
    expect(api.page).toHaveBeenLastCalledWith({}, null);
    fireEvent.change(screen.getByLabelText("Staff account"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Member username"), {
      target: { value: " al_member " },
    });
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "reports.update" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-03" } });
    await click("Apply filters");
    expect(api.page).toHaveBeenLastCalledWith(
      {
        staffId: "s1",
        username: "al_member",
        action: "reports.update",
        from: "2026-11-01",
        to: "2026-11-03",
      },
      null,
    );
    fireEvent.click(screen.getByLabelText("System entries only"));
    await click("Apply filters");
    expect(api.page).toHaveBeenLastCalledWith(expect.objectContaining({ systemOnly: true }), null);
  });

  it("loads the next page after the last entry", async () => {
    const full = Array.from({ length: 50 }, (_, i) => entry({ id: `e${i}` }));
    const api = fakeApi({
      page: vi
        .fn()
        .mockResolvedValueOnce(full)
        .mockResolvedValueOnce([entry({ id: "older" })]),
    });
    await show(api);
    await click("Load more");
    expect(api.page).toHaveBeenLastCalledWith({}, full[49]!.cursor);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the loaded entries when loading more fails", async () => {
    const full = Array.from({ length: 50 }, (_, i) => entry({ id: `e${i}` }));
    const api = fakeApi({
      page: vi.fn().mockResolvedValueOnce(full).mockRejectedValueOnce(new Error("offline")),
    });
    await show(api);
    await click("Load more");
    expect(screen.getByRole("alert").textContent).toMatch(/load more entries/);
    expect(
      within(screen.getByRole("list", { name: "Audit log" })).getAllByText("reports.update"),
    ).toHaveLength(50);
  });

  it("names a deleted actor by id", async () => {
    await show(
      fakeApi({
        page: vi
          .fn()
          .mockResolvedValue([entry({ actorKind: "member", actorName: "", actorId: "m7" })]),
      }),
    );
    expect(screen.getByText(/Deleted account m7/)).toBeTruthy();
  });

  it("says when no entries match", async () => {
    await show(fakeApi());
    expect(screen.getByText("No entries match these filters")).toBeTruthy();
  });
});

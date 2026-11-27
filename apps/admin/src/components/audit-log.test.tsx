import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditApi, AuditEntry } from "@/lib/audit";
import { AuditLog } from "./audit-log";

afterEach(cleanup);

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "e1",
  at: new Date("2026-11-03T09:00:00+03:00"),
  cursor: { createdAt: "2026-11-03T06:00:00.123456+00:00", id: "e1" },
  actorKind: "staff",
  actorId: "s9",
  actorName: "Test Administrator",
  action: "members.update",
  targetType: "members",
  targetId: "00000000-0000-0000-0000-0000000000a1",
  before: { status: "approved", note: "x", updated_at: "a" },
  after: { status: "suspended", note: "x", updated_at: "b" },
  ip: "10.0.0.1",
  kind: "people",
  routine: false,
  ...over,
});

const fakeApi = (over: Partial<AuditApi> = {}): AuditApi => ({
  page: vi.fn().mockResolvedValue([]),
  names: vi
    .fn()
    .mockResolvedValue(new Map([["00000000-0000-0000-0000-0000000000a1", "Neema Mushi"]])),
  staff: vi.fn().mockResolvedValue([{ id: "s1", name: "Other Administrator" }]),
  ...over,
});

const click = (name: string | RegExp) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(api: AuditApi, superAdmin = true) {
  await act(async () => {
    render(<AuditLog api={api} superAdmin={superAdmin} />);
  });
}

describe("AuditLog (A13)", () => {
  it("is for Super Admins only", async () => {
    const api = fakeApi();
    await show(api, false);
    expect(screen.getByText("Only Super Admins can open the audit log.")).toBeTruthy();
    expect(api.page).not.toHaveBeenCalled();
  });

  it("shows each entry as a plain sentence under its day, with names instead of ids", async () => {
    const api = fakeApi({ page: vi.fn().mockResolvedValue([entry()]) });
    await show(api);
    expect(api.names).toHaveBeenCalledWith(["00000000-0000-0000-0000-0000000000a1"]);
    const day = within(screen.getByRole("list", { name: /3 November/ }));
    expect(day.getByRole("button").textContent).toBe(
      "Neema Mushi's account went from approved to suspended",
    );
    expect(day.getByText("09:00")).toBeTruthy();
    expect(screen.queryByText("members.update")).toBeNull();
  });

  it("opens an entry with who, when, where, what changed and the technical record", async () => {
    await show(fakeApi({ page: vi.fn().mockResolvedValue([entry()]) }));
    await click(/account went from approved to suspended/);
    const panel = within(screen.getByRole("complementary"));
    expect(panel.getByText("Test Administrator")).toBeTruthy();
    expect(panel.getByText("10.0.0.1")).toBeTruthy();
    expect(panel.getByText("Status")).toBeTruthy();
    expect(panel.getByText("approved")).toBeTruthy();
    expect(panel.queryByText(/note/i)).toBeNull();
    expect(panel.queryByText("members.update")).toBeNull();
    await click("Technical details");
    expect(panel.getByText("members.update")).toBeTruthy();
    expect(panel.getAllByText(/"note": "x"/)).toHaveLength(2);
    await click("Close");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("hides routine jobs unless asked, and filters by person, kind and dates", async () => {
    const api = fakeApi();
    await show(api);
    expect(api.page).toHaveBeenLastCalledWith({}, null);
    fireEvent.change(screen.getByLabelText("Who"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Member username"), {
      target: { value: " al_member " },
    });
    await click("Investors");
    await click("Settings");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-03" } });
    fireEvent.click(screen.getByLabelText("Show routine system jobs"));
    await click("Apply filters");
    expect(api.page).toHaveBeenLastCalledWith(
      {
        staffId: "s1",
        username: "al_member",
        kinds: ["investors", "settings"],
        from: "2026-11-01",
        to: "2026-11-03",
        showRoutine: true,
      },
      null,
    );
    fireEvent.change(screen.getByLabelText("Who"), { target: { value: "system" } });
    await click("Apply filters");
    expect(api.page).toHaveBeenLastCalledWith(expect.objectContaining({ systemOnly: true }), null);
    await click("Clear filters");
    expect(api.page).toHaveBeenLastCalledWith({}, null);
  });

  it("loads the next page after the last entry and looks up only new names", async () => {
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
    expect(api.names).toHaveBeenCalledTimes(1);
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
    expect(screen.getAllByText(/account went from approved to suspended/)).toHaveLength(50);
  });

  it("names a deleted actor by id and the system as the system", async () => {
    await show(
      fakeApi({
        page: vi
          .fn()
          .mockResolvedValue([
            entry({ id: "a", action: "plan_documents.insert", actorName: "", actorId: "m7" }),
            entry({ id: "b", action: "plan_documents.insert", actorKind: "system", actorId: null }),
          ]),
      }),
    );
    expect(screen.getByText(/Deleted account m7/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "The system added a plan document" })).toBeTruthy();
  });

  it("says when no entries match", async () => {
    await show(fakeApi());
    expect(screen.getByText("No entries match these filters")).toBeTruthy();
  });

  it("says when the log cannot load", async () => {
    await show(fakeApi({ page: vi.fn().mockRejectedValue(new Error("offline")) }));
    expect(screen.getByText(/couldn't load the audit log/)).toBeTruthy();
  });
});

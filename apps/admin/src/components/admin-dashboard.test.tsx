import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STATS_REFRESH_MS, type AdminStats, type AdminStatsApi } from "@/lib/admin-dashboard";
import { AdminDashboard } from "./admin-dashboard";
import { gridStep } from "./weekly-members-chart";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const eat = (local: string) => new Date(`${local}+03:00`);

const stats = (over: Partial<AdminStats> = {}): AdminStats => ({
  verifiedMembers: 42,
  pendingSubmittedAt: [eat("2026-11-02T09:00"), eat("2026-11-04T08:00")],
  rejectedMembers: 3,
  openReportCases: 1,
  signUpsToday: 4,
  dailyCap: 25,
  ...over,
});

const fakeApi = (s: AdminStats = stats(), over: Partial<AdminStatsApi> = {}): AdminStatsApi => ({
  stats: vi.fn().mockResolvedValue(s),
  alerts: vi.fn().mockResolvedValue([]),
  acknowledge: vi.fn().mockResolvedValue(true),
  weeklyNewMembers: vi.fn().mockResolvedValue([]),
  ...over,
});

async function show(api: AdminStatsApi, superAdmin = false) {
  await act(async () => {
    render(
      <AdminDashboard api={api} superAdmin={superAdmin} now={() => eat("2026-11-04T12:00")} />,
    );
  });
}

const link = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("AdminDashboard (A01)", () => {
  it("links each count to its filtered queue", async () => {
    await show(fakeApi());
    expect(link(/Verified members.*42/)).toBe("/members?status=approved");
    expect(link(/Waiting for verification.*2/)).toBe("/verification");
    expect(link(/Rejected members.*3/)).toBe("/members?status=rejected");
    expect(link(/Open reports.*1/)).toBe("/reports");
  });

  it("shows the age of the oldest application and alerts after 2 working days", async () => {
    await show(fakeApi());
    expect(screen.getByText("Oldest: 2 days")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/1 application/);
  });

  it("has no alert when nothing is overdue", async () => {
    await show(fakeApi(stats({ pendingSubmittedAt: [] })));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the daily cap status, with the switch for Super Admins", async () => {
    await show(fakeApi());
    expect(screen.getByText("4 of 25")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Change in Settings" })).toBeNull();
    cleanup();
    await show(fakeApi(stats({ dailyCap: null })), true);
    expect(screen.getByText("No daily limit")).toBeTruthy();
    expect(link(/Change in Settings/)).toBe("/settings");
  });

  it("keeps the counts and says so when a refresh fails", async () => {
    vi.useFakeTimers();
    const api = fakeApi(stats(), {
      stats: vi.fn().mockResolvedValueOnce(stats()).mockRejectedValueOnce(new Error("offline")),
    });
    await show(api);
    await act(async () => {
      vi.advanceTimersByTime(STATS_REFRESH_MS);
    });
    expect(link(/Verified members.*42/)).toBe("/members?status=approved");
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain(
      "We couldn't refresh the counts. They may be out of date.",
    );
  });

  it("shows security alerts and marks one as seen (PRD section 15)", async () => {
    const api = fakeApi(stats(), {
      alerts: vi.fn().mockResolvedValue([
        {
          id: "a1",
          summary: "3 accounts locked in the last hour",
          raisedAt: eat("2026-11-05T09:00"),
        },
      ]),
    });
    await show(api);
    const panel = screen.getByRole("region", { name: "Security alerts" });
    expect(panel.textContent).toMatch(/3 accounts locked in the last hour/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as seen" })));
    expect(api.acknowledge).toHaveBeenCalledWith("a1");
    expect(screen.queryByRole("region", { name: "Security alerts" })).toBeNull();
  });

  it("refreshes the counts every 15 minutes", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    await show(api);
    expect(api.stats).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(STATS_REFRESH_MS);
    });
    expect(api.stats).toHaveBeenCalledTimes(2);
  });

  it("draws new verified members per week, with this week's count and each week named (D06)", async () => {
    const weeks = [0, 22, 25, 21, 30, 28, 34, 36].map((newMembers, i) => ({
      weekStart: `2026-${i < 3 ? "09" : i < 7 ? "10" : "11"}-0${(i % 9) + 1}`,
      newMembers,
    }));
    weeks[0]!.weekStart = "2026-10-05";
    weeks[7]!.weekStart = "2026-11-02";
    await show(fakeApi(stats(), { weeklyNewMembers: vi.fn().mockResolvedValue(weeks) }));
    expect(
      screen.getByRole("img", { name: "New verified members per week, from 0 to 36" }),
    ).toBeTruthy();
    expect(screen.getByText("36 this week")).toBeTruthy();
    expect(screen.getAllByText("Week of 2 Nov: 36 new members").length).toBeGreaterThan(0);
    expect(link(/Open members/)).toBe("/members?status=approved");
  });

  it("keeps the dashboard when the weekly chart cannot load", async () => {
    await show(
      fakeApi(stats(), { weeklyNewMembers: vi.fn().mockRejectedValue(new Error("offline")) }),
    );
    expect(link(/Verified members.*42/)).toBe("/members?status=approved");
    expect(screen.getByText(/couldn't load the weekly chart/)).toBeTruthy();
  });

  it("picks gridlines of 1, 2 or 5 times a power of ten", () => {
    expect(gridStep(0)).toBe(1);
    expect(gridStep(4)).toBe(1);
    expect(gridStep(36)).toBe(10);
    expect(gridStep(7)).toBe(2);
    expect(gridStep(180)).toBe(50);
  });
});

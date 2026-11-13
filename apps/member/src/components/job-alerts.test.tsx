import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sameFilters, type JobAlert, type JobAlertsApi } from "../lib/job-alerts";
import { AlertSwitch, JobAlertsScreen } from "./job-alerts";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

afterEach(cleanup);

const alert = (over: Partial<JobAlert> = {}): JobAlert => ({
  id: "a1",
  kind: "job",
  region: "r1",
  regionName: { en: "Mwanza", sw: "Mwanza" },
  sector: null,
  sectorName: null,
  employment: null,
  remoteOnly: false,
  ...over,
});

const fakeApi = (over: Partial<JobAlertsApi> = {}): JobAlertsApi => ({
  list: vi.fn().mockResolvedValue([]),
  add: vi.fn().mockResolvedValue("ok"),
  remove: vi.fn().mockResolvedValue(true),
  ...over,
});

const show = (node: React.ReactElement) =>
  act(async () => {
    render(node);
  });

describe("sameFilters (O13)", () => {
  it("matches an alert to the same filters, ignoring the posted-within filter", () => {
    expect(sameFilters(alert(), { kind: "job", region: "r1", postedWithin: 7 })).toBe(true);
    expect(sameFilters(alert(), { kind: "job" })).toBe(false);
    expect(sameFilters(alert({ remoteOnly: true }), { kind: "job", region: "r1" })).toBe(false);
  });
});

describe("AlertSwitch (O13)", () => {
  it("saves the filters on screen when switched on", async () => {
    const add = vi.fn().mockResolvedValue("ok");
    await show(<AlertSwitch api={fakeApi({ add })} filters={{ kind: "job", region: "r1" }} />);
    const toggle = screen.getByRole("switch", { name: "Email me new posts like these" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => fireEvent.click(toggle));
    expect(add).toHaveBeenCalledWith({ kind: "job", region: "r1" });
  });

  it("shows on for filters that already have an alert, and removes it when switched off", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    await show(
      <AlertSwitch
        api={fakeApi({ list: vi.fn().mockResolvedValue([alert()]), remove })}
        filters={{ kind: "job", region: "r1" }}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "Email me new posts like these" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await act(async () => fireEvent.click(toggle));
    expect(remove).toHaveBeenCalledWith("a1");
  });

  it("says when the member already has 5 alerts", async () => {
    await show(
      <AlertSwitch api={fakeApi({ add: vi.fn().mockResolvedValue("limit") })} filters={{}} />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("switch", { name: "Email me new posts like these" })),
    );
    expect(screen.getByText(/You can keep up to 5 alerts/)).toBeTruthy();
  });
});

describe("JobAlertsScreen (O13)", () => {
  it("lists each alert in words and removes one", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const list = vi
      .fn()
      .mockResolvedValueOnce([
        alert(),
        alert({ id: "a2", kind: null, region: null, regionName: null, remoteOnly: true }),
        alert({ id: "a3", kind: null, region: null, regionName: null }),
      ])
      .mockResolvedValue([]);
    await show(<JobAlertsScreen api={fakeApi({ list, remove })} />);
    expect(screen.getByText("Job · Mwanza")).toBeTruthy();
    expect(screen.getByText("Remote work only")).toBeTruthy();
    expect(screen.getByText("Any opportunity")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Remove the alert: Job · Mwanza" })),
    );
    expect(remove).toHaveBeenCalledWith("a1");
    expect(screen.getByText("No alerts yet")).toBeTruthy();
  });
});

import "../test-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScanApi, ScanMatch } from "../lib/scan";
import { ScanScreen } from "./scan";

afterEach(cleanup);

const match = (over: Partial<ScanMatch> = {}): ScanMatch => ({
  id: "o1",
  type: "job",
  title: "Accountant for a coffee trader",
  role: "Accountant",
  employmentType: "full_time",
  remote: false,
  region: { en: "Kilimanjaro", sw: "Kilimanjaro" },
  district: { en: "Moshi", sw: "Moshi" },
  sector: { en: "Agriculture", sw: "Kilimo" },
  closingAt: "2026-11-20",
  featured: false,
  posterId: "m2",
  posterName: "Kilimanjaro Coffee Traders",
  isMine: false,
  skills: ["bookkeeping"],
  score: 35,
  reasons: [
    { code: "skills", skills: ["bookkeeping", "excel"] },
    { code: "location", kind: "district" },
  ],
  ...over,
});

const show = (api: ScanApi) =>
  act(async () => {
    render(<ScanScreen api={api} />);
  });

describe("ScanScreen (S16, O07)", () => {
  it("lists matches with their top two reasons", async () => {
    await show({
      matches: vi.fn().mockResolvedValue([match()]),
      missing: vi.fn().mockResolvedValue([]),
    });
    expect(screen.getByRole("link", { name: "Accountant for a coffee trader" })).toBeTruthy();
    expect(screen.getByText("Your skills: bookkeeping, excel · In your district")).toBeTruthy();
    expect(screen.queryByText(/35/)).toBeNull();
  });

  it("words every reason", async () => {
    await show({
      matches: vi.fn().mockResolvedValue([
        match({ id: "a", reasons: [{ code: "sector" }, { code: "study" }] }),
        match({
          id: "b",
          title: "Remote role",
          reasons: [
            { code: "location", kind: "region" },
            { code: "location", kind: "remote" },
          ],
        }),
      ]),
      missing: vi.fn().mockResolvedValue([]),
    });
    expect(screen.getByText("Your sector or profession · Fits your studies")).toBeTruthy();
    expect(screen.getByText("In your region · Remote work")).toBeTruthy();
  });

  it("asks for the missing profile fields, and says so when there are no matches", async () => {
    await show({
      matches: vi.fn().mockResolvedValue([]),
      missing: vi.fn().mockResolvedValue(["skills", "location"]),
    });
    expect(
      screen.getByText("Add skills and your district to your profile for better matches."),
    ).toBeTruthy();
    expect(screen.getByText("Complete your profile to see matches")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "Complete your profile" })[0]!.getAttribute("href"),
    ).toBe("/profile/edit");
  });

  it("says there are no matches when the profile is complete", async () => {
    await show({ matches: vi.fn().mockResolvedValue([]), missing: vi.fn().mockResolvedValue([]) });
    expect(screen.getByText("No matches right now")).toBeTruthy();
  });

  it("offers a retry when the scan fails", async () => {
    await show({
      matches: vi.fn().mockRejectedValue(new Error("offline")),
      missing: vi.fn().mockResolvedValue([]),
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

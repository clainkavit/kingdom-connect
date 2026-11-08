import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeasApi, IdeaSummary } from "../lib/ideas";
import { NO_FILTERS, type SavableIdea } from "../lib/investor";
import { IdeasPool } from "./ideas-pool";
import { InvestorApply, SavedIdeas } from "./investor";
import { fakeInvestor } from "./investor.fake";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const click = async (role: string, name: string) => {
  await act(async () => fireEvent.click(screen.getByRole(role, { name })));
};

const summary: IdeaSummary = {
  id: "i1",
  title: "Solar dryers",
  problem: "Farmers lose much of their mango harvest before market.",
  sectorEn: "Agriculture",
  sectorSw: "Kilimo",
  stage: "prototype",
  seeking: "investor",
  investmentMin: 10000000,
  investmentMax: 50000000,
  ownerId: "m1",
  ownerName: "Asha Mwita",
  interestCount: 3,
  isMine: false,
};
const savable = (over: Partial<SavableIdea> = {}): SavableIdea => ({
  ...summary,
  saved: false,
  ...over,
});

const ideas = (over: Partial<IdeasApi> = {}): IdeasApi => ({
  pool: vi.fn().mockResolvedValue([summary]),
  summary: vi.fn().mockResolvedValue(summary),
  byOwner: vi.fn().mockResolvedValue([]),
  mine: vi.fn().mockResolvedValue([]),
  sectors: vi.fn().mockResolvedValue([{ value: "s1", label: "Agriculture" }]),
  save: vi.fn(),
  archive: vi.fn(),
  ...over,
});

describe("Investor tools (I06)", () => {
  it("are absent, not locked, for a member without the flag", async () => {
    await show(<IdeasPool api={ideas()} investor={fakeInvestor()} />);
    expect(screen.getByText("Solar dryers")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Saved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Investor tools" })).toBeNull();
  });

  it("offers a Level 2 member the way to apply, quietly", async () => {
    const status = vi.fn().mockResolvedValue("can_apply");
    await show(<IdeasPool api={ideas()} investor={fakeInvestor({ status })} />);
    expect(screen.getByRole("link", { name: "Investor tools" }).getAttribute("href")).toBe(
      "/ideas/investor",
    );
  });

  it("give a flag holder filters, Save and Saved", async () => {
    const pool = vi.fn().mockResolvedValue([savable()]);
    const setSaved = vi.fn().mockResolvedValue("ok");
    const status = vi.fn().mockResolvedValue("investor");
    await show(<IdeasPool api={ideas()} investor={fakeInvestor({ status, pool, setSaved })} />);
    expect(pool).toHaveBeenCalledWith(NO_FILTERS, false, 0);
    expect(screen.getByRole("link", { name: "Saved" }).getAttribute("href")).toBe("/ideas/saved");
    await click("button", "Save");
    expect(setSaved).toHaveBeenCalledWith("i1", true);
    expect(screen.getByRole("button", { name: "Saved ✓" })).toBeTruthy();
    await click("button", "Filters");
    await click("radio", "Prototype");
    fireEvent.change(screen.getByLabelText("Range from (TZS)"), { target: { value: "20000000" } });
    await click("button", "Show ideas");
    expect(pool).toHaveBeenLastCalledWith(
      { sectorId: null, stage: "prototype", min: 20000000, max: null, regionId: null },
      false,
      0,
    );
  });

  it("keep the saved list private to the flag holder", async () => {
    const pool = vi.fn().mockResolvedValue([]);
    await show(
      <SavedIdeas
        investor={fakeInvestor({ status: vi.fn().mockResolvedValue("investor"), pool })}
      />,
    );
    expect(pool).toHaveBeenCalledWith(NO_FILTERS, true, 0);
    expect(screen.getByText("Nothing saved yet")).toBeTruthy();
    cleanup();
    await show(<SavedIdeas investor={fakeInvestor()} />);
    expect(screen.queryByText("Nothing saved yet")).toBeNull();
  });
});

describe("InvestorApply (IDEA-6)", () => {
  it("lets a Level 2 member apply with a band and a note", async () => {
    const status = vi.fn().mockResolvedValue("can_apply");
    const apply = vi.fn().mockResolvedValue("ok");
    await show(<InvestorApply ideas={ideas()} investor={fakeInvestor({ status, apply })} />);
    await click("radio", "TZS 10M to 50M");
    status.mockResolvedValue("applied");
    await click("button", "Apply");
    expect(apply).toHaveBeenCalledWith(null, "10m_to_50m", "");
    expect(
      screen.getByText(
        "Your application is with the admins. You'll get a notification if it is approved.",
      ),
    ).toBeTruthy();
  });

  it("is not there for a member who cannot apply", async () => {
    await show(<InvestorApply ideas={ideas()} investor={fakeInvestor()} />);
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });
});

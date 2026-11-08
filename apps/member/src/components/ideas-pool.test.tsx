import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POOL_PAGE, type IdeaSummary, type IdeasApi } from "../lib/ideas";
import { fakeAccess } from "./idea-access.fake";
import { fakeInvestor } from "./investor.fake";
import { IdeasPool, IdeaSummaryScreen, ProfileIdeas } from "./ideas-pool";

afterEach(cleanup);

const summary = (over: Partial<IdeaSummary> = {}): IdeaSummary => ({
  id: "i1",
  title: "Solar dryers for fruit farmers",
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
  ...over,
});

const fakeApi = (over: Partial<IdeasApi> = {}): IdeasApi => ({
  pool: vi.fn().mockResolvedValue([summary()]),
  summary: vi.fn().mockResolvedValue(summary()),
  byOwner: vi.fn().mockResolvedValue([]),
  mine: vi.fn().mockResolvedValue([]),
  sectors: vi.fn().mockResolvedValue([]),
  save: vi.fn(),
  archive: vi.fn(),
  ...over,
});

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

describe("IdeasPool (S22)", () => {
  it("shows cards with the facts, the owner and the interest count", async () => {
    await show(
      <IdeasPool
        investor={fakeInvestor()}
        api={fakeApi({
          pool: vi.fn().mockResolvedValue([
            summary(),
            summary({
              id: "i2",
              title: "Clinic booking",
              ownerId: null,
              ownerName: null,
              interestCount: 1,
            }),
          ]),
        })}
      />,
    );
    expect(
      screen.getAllByText("Agriculture · Prototype · Investor · TZS 10,000,000 to 50,000,000"),
    ).toHaveLength(2);
    expect(screen.getByText("Asha Mwita · 3 interested")).toBeTruthy();
    expect(screen.getByText("A verified member · 1 interested")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clinic booking" }).getAttribute("href")).toBe(
      "/ideas/i2",
    );
    expect(screen.getByRole("link", { name: "My ideas" }).getAttribute("href")).toBe("/ideas/mine");
  });

  it("loads more, 20 at a time", async () => {
    const page = Array.from({ length: POOL_PAGE }, (_, i) =>
      summary({ id: `p${i}`, title: `Idea ${i}` }),
    );
    const pool = vi.fn();
    pool.mockResolvedValueOnce(page);
    pool.mockResolvedValueOnce([summary({ id: "last", title: "The last idea" })]);
    await show(<IdeasPool api={fakeApi({ pool })} investor={fakeInvestor()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load more" })));
    expect(pool).toHaveBeenLastCalledWith(1);
    expect(screen.getByText("The last idea")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("invites the first idea when the pool is empty", async () => {
    await show(
      <IdeasPool
        api={fakeApi({ pool: vi.fn().mockResolvedValue([]) })}
        investor={fakeInvestor()}
      />,
    );
    expect(screen.getByText("No ideas yet")).toBeTruthy();
  });
});

describe("IdeaSummaryScreen (S23)", () => {
  it("shows the summary, the owner and that the details are locked", async () => {
    await show(<IdeaSummaryScreen api={fakeApi()} access={fakeAccess()} ideaId="i1" />);
    expect(screen.getByText("TZS 10,000,000 to 50,000,000")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Asha Mwita" }).getAttribute("href")).toBe(
      "/profile/m1",
    );
    expect(
      screen.getByText(
        "The details stay locked until the owner approves your request and you accept the NDA.",
      ),
    ).toBeTruthy();
  });

  it("never names the owner of an idea shared without a name", async () => {
    await show(
      <IdeaSummaryScreen
        access={fakeAccess()}
        api={fakeApi({
          summary: vi.fn().mockResolvedValue(summary({ ownerId: null, ownerName: null })),
        })}
        ideaId="i1"
      />,
    );
    expect(screen.getByText("A verified member")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Asha/ })).toBeNull();
  });

  it("sends the owner to My ideas", async () => {
    await show(
      <IdeaSummaryScreen
        access={fakeAccess()}
        api={fakeApi({ summary: vi.fn().mockResolvedValue(summary({ isMine: true })) })}
        ideaId="i1"
      />,
    );
    expect(screen.getByRole("link", { name: "Manage it in My ideas" })).toBeTruthy();
  });
});

describe("ProfileIdeas (S11)", () => {
  it("lists a member's named ideas, or says there are none", async () => {
    const byOwner = vi.fn().mockResolvedValue([summary()]);
    await show(<ProfileIdeas api={fakeApi({ byOwner })} memberId="m1" />);
    expect(byOwner).toHaveBeenCalledWith("m1");
    expect(screen.getByText("Solar dryers for fruit farmers")).toBeTruthy();
    cleanup();
    await show(<ProfileIdeas api={fakeApi()} memberId="m1" />);
    expect(screen.getByText("No published ideas.")).toBeTruthy();
  });
});

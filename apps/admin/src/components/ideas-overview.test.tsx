import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeaRow, IdeasOverview, IdeasOverviewApi } from "@/lib/ideas-overview";
import { IdeasOverviewScreen } from "./ideas-overview";

afterEach(cleanup);

const overview = (over: Partial<IdeasOverview> = {}): IdeasOverview => ({
  published: 52,
  waiting: 4,
  hidden: 1,
  archived: 9,
  byStage: { idea: 19, prototype: 15, early_revenue: 11, growing: 7 },
  byIndustry: [
    { sectorEn: "Agriculture and food", sectorSw: "Kilimo na chakula", ideas: 13 },
    { sectorEn: "Education", sectorSw: "Elimu", ideas: 8 },
  ],
  interestSent: 40,
  ownerApproved: 21,
  ndaAccepted: 14,
  ...over,
});

const row = (over: Partial<IdeaRow> = {}): IdeaRow => ({
  id: "i1",
  title: "Solar cold storage for fish traders",
  postedBy: "Halima Mbwana",
  sharedWithoutName: true,
  sectorEn: "Agriculture and food",
  sectorSw: "Kilimo na chakula",
  stage: "prototype",
  status: "published",
  interested: 7,
  withAccess: 2,
  lastActivity: new Date("2026-11-10T09:00:00+03:00"),
  ...over,
});

const fakeApi = (over: Partial<IdeasOverviewApi> = {}): IdeasOverviewApi => ({
  overview: vi.fn().mockResolvedValue(overview()),
  list: vi.fn().mockResolvedValue([row()]),
  waiting: vi.fn().mockResolvedValue([
    {
      id: "w1",
      title: "Cashew drying with solar tunnels",
      sectorEn: "Agriculture and food",
      sectorSw: "Kilimo na chakula",
      stage: "idea",
      postedBy: "john_ngowi",
      sharedWithoutName: false,
    },
  ]),
  sectors: vi.fn().mockResolvedValue([{ id: "s1", nameEn: "Education", nameSw: "Elimu" }]),
  ...over,
});

const show = (api: IdeasOverviewApi) =>
  act(async () => {
    render(<IdeasOverviewScreen api={api} />);
  });

describe("IdeasOverviewScreen (A17, D05)", () => {
  it("shows the counts, stages, industries and interest to NDA", async () => {
    await show(fakeApi());
    expect(screen.getByRole("button", { name: /Published.*52/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Waiting for moderation.*4/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hidden after a report.*1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Archived by owners.*9/ })).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Published ideas by stage: Idea 19, Prototype 15, Early revenue 11, Growing 7",
      }),
    ).toBeTruthy();
    const industry = screen.getByRole("list", { name: "Published ideas by industry" });
    expect(within(industry).getByText("Agriculture and food")).toBeTruthy();
    expect(within(industry).getByText("13")).toBeTruthy();
    expect(screen.getByText("This month. 35% of interest ends with an accepted NDA.")).toBeTruthy();
  });

  it("lists every idea in brief, with the poster also for one shared without a name", async () => {
    await show(fakeApi());
    const table = screen.getByRole("table");
    expect(within(table).getByText("Solar cold storage for fish traders")).toBeTruthy();
    expect(within(table).getByText("Halima Mbwana")).toBeTruthy();
    expect(within(table).getByText("Shared without a name")).toBeTruthy();
    expect(within(table).getByText("Prototype")).toBeTruthy();
    expect(within(table).getByText("7")).toBeTruthy();
    expect(within(table).getByText("2")).toBeTruthy();
  });

  it("offers no export and names no investor (#186)", async () => {
    await show(fakeApi());
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /export/i })).toBeNull();
    expect(screen.queryByText(/investor/i)).toBeNull();
  });

  it("searches and filters, and a count tile filters by its status", async () => {
    const list = vi.fn().mockResolvedValue([row()]);
    await show(fakeApi({ list }));
    fireEvent.change(screen.getByLabelText("Title or poster"), { target: { value: " solar " } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })));
    expect(list).toHaveBeenLastCalledWith({ query: "solar" }, 0);

    await act(async () =>
      fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "s1" } }),
    );
    expect(list).toHaveBeenLastCalledWith({ query: "solar", sector: "s1" }, 0);

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Hidden after a report/ })),
    );
    expect(list).toHaveBeenLastCalledWith({ query: "solar", sector: "s1", status: "hidden" }, 0);
    expect(
      screen.getByRole("button", { name: /Hidden after a report/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("pages 25 at a time", async () => {
    const full = Array.from({ length: 25 }, (_, i) => row({ id: `i${i}`, title: `Idea ${i}` }));
    const list = vi.fn().mockResolvedValueOnce(full).mockResolvedValueOnce([row()]);
    await show(fakeApi({ list }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    expect(list).toHaveBeenLastCalledWith({}, 1);
    expect(screen.getByText("Page 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
  });

  it("shows the ideas waiting for moderation with a link to the queue", async () => {
    await show(fakeApi());
    expect(screen.getByText("Cashew drying with solar tunnels")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open moderation queue" }).getAttribute("href")).toBe(
      "/moderation",
    );
  });

  it("says when nothing matches, and offers a retry when loading fails", async () => {
    await show(
      fakeApi({
        list: vi.fn().mockResolvedValue([]),
        overview: vi.fn().mockRejectedValue(new Error("offline")),
      }),
    );
    expect(screen.getByText("No ideas yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

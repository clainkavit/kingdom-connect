import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListingSource, PublicListing, PublicListingsApi } from "@/lib/public-listings";
import { PublicListingsScreen } from "./public-listings";

afterEach(cleanup);

const listing = (over: Partial<PublicListing> = {}): PublicListing => ({
  id: "l1",
  sourceId: "s-nest",
  sourceName: "NeST",
  kind: "tenders",
  title: "Constructions of Ikungi bus stand",
  employer: "IKUNGI DISTRICT COUNCIL",
  summary: "Works, Small Works",
  referenceNo: "84R5/2026/2027/W/01",
  posts: null,
  originalUrl: "https://nest.go.tz/tenders/published-tenders",
  language: "en",
  closingOn: "2026-12-12",
  feeNote: "Fees or bid security may apply. See the official notice.",
  translatedTitle: "Ujenzi wa stendi ya mabasi ya Ikungi",
  translatedSummary: null,
  suggestedRegionId: "r-singida",
  suggestedDistrictId: null,
  suggestedSectorId: "sec-construction",
  ...over,
});

const job = listing({
  id: "l2",
  sourceId: "s-ajira",
  sourceName: "Ajira Portal",
  kind: "jobs",
  title: "Mwandishi mwendesha ofisi daraja la II",
  employer: "Halmashauri ya Wilaya ya Siha",
  summary: null,
  referenceNo: null,
  posts: 4,
  language: "sw",
  feeNote: null,
  translatedTitle: null,
  suggestedRegionId: null,
  suggestedSectorId: null,
});

const source = (over: Partial<ListingSource> = {}): ListingSource => ({
  id: "s-crdb",
  name: "CRDB Bank",
  kind: "jobs",
  pageUrl: "https://careers.crdbbank.co.tz/jobs",
  active: true,
  readerReady: true,
  lastRunAt: new Date("2026-11-28T05:40:00+03:00"),
  lastFound: 9,
  lastError: null,
  ...over,
});

const fakeApi = (over: Partial<PublicListingsApi> = {}): PublicListingsApi => ({
  waiting: vi.fn().mockResolvedValue([listing(), job]),
  waitingCount: vi.fn().mockResolvedValue(2),
  sources: vi.fn().mockResolvedValue([source()]),
  options: vi.fn().mockResolvedValue({
    sectors: [
      { value: "sec-construction", label: "Construction" },
      { value: "sec-other", label: "Other" },
    ],
    regions: [
      { value: "r-singida", label: "Singida" },
      { value: "r-kilimanjaro", label: "Kilimanjaro" },
    ],
  }),
  districts: vi.fn().mockResolvedValue([{ value: "d-ikungi", label: "Ikungi" }]),
  slots: vi.fn().mockResolvedValue({ used: 2, limit: 5 }),
  approve: vi.fn().mockResolvedValue({ result: "ok", featured: null }),
  discard: vi.fn().mockImplementation(async (ids: string[]) => ids.length),
  setActive: vi.fn().mockResolvedValue("ok"),
  addSource: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = (name: string | RegExp) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));
const type = (label: string, value: string) =>
  act(async () => fireEvent.change(screen.getByLabelText(label), { target: { value } }));

async function show(api: PublicListingsApi) {
  await act(async () => {
    render(<PublicListingsScreen api={api} />);
  });
}

describe("PublicListingsScreen queue (O20)", () => {
  it("lists waiting listings with their source, employer and closing date", async () => {
    await show(fakeApi());
    expect(screen.getByText("Constructions of Ikungi bus stand")).toBeTruthy();
    expect(screen.getByText("Ujenzi wa stendi ya mabasi ya Ikungi")).toBeTruthy();
    expect(screen.getByText(/NeST · IKUNGI DISTRICT COUNCIL · Closes/)).toBeTruthy();
    expect(screen.getByText("Mwandishi mwendesha ofisi daraja la II")).toBeTruthy();
  });

  it("filters by source and searches titles in either language", async () => {
    await show(fakeApi());
    await type("Source", "s-ajira");
    expect(screen.queryByText("Constructions of Ikungi bus stand")).toBeNull();
    expect(screen.getByText("Mwandishi mwendesha ofisi daraja la II")).toBeTruthy();
    await type("Source", "");
    await type("Search titles", "stendi");
    expect(screen.getByText("Constructions of Ikungi bus stand")).toBeTruthy();
    expect(screen.queryByText("Mwandishi mwendesha ofisi daraja la II")).toBeNull();
  });

  it("discards the ticked listings at once", async () => {
    const api = fakeApi();
    await show(api);
    expect(
      (screen.getByRole("button", { name: "Discard selected (0)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () =>
      fireEvent.click(screen.getByLabelText("Select Constructions of Ikungi bus stand")),
    );
    await click("Discard selected (1)");
    expect(api.discard).toHaveBeenCalledWith(["l1"]);
    expect(screen.getByText("1 listing discarded.")).toBeTruthy();
    expect(screen.queryByText("Constructions of Ikungi bus stand")).toBeNull();
  });

  it("selects every shown listing", async () => {
    const api = fakeApi();
    await show(api);
    await act(async () => fireEvent.click(screen.getByLabelText("Select all shown")));
    await click("Discard selected (2)");
    expect(api.discard).toHaveBeenCalledWith(["l1", "l2"]);
    expect(screen.getByText("2 listings discarded.")).toBeTruthy();
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
  });

  it("says when nothing is waiting", async () => {
    await show(fakeApi({ waiting: vi.fn().mockResolvedValue([]) }));
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
  });

  it("offers a retry when the queue fails to load", async () => {
    await show(fakeApi({ waiting: vi.fn().mockRejectedValue(new Error("down")) }));
    expect(screen.getByText("We couldn't load the public listings.")).toBeTruthy();
  });
});

describe("PublicListingsScreen review (O20)", () => {
  it("opens a tender with the suggestions filled in and the official link", async () => {
    await show(fakeApi());
    await click(/Constructions of Ikungi bus stand/);
    expect(
      screen.getByRole("link", { name: "Open the official notice" }).getAttribute("href"),
    ).toBe("https://nest.go.tz/tenders/published-tenders");
    expect((screen.getByLabelText("Title in Swahili") as HTMLInputElement).value).toBe(
      "Ujenzi wa stendi ya mabasi ya Ikungi",
    );
    expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe("r-singida");
    expect((screen.getByLabelText("Sector") as HTMLSelectElement).value).toBe("sec-construction");
    expect((screen.getByLabelText("Fee note") as HTMLInputElement).value).toMatch(/bid security/);
    expect(screen.queryByLabelText("Employment type")).toBeNull();
    expect(screen.getByText("2 of 5 featured slots in use")).toBeTruthy();
  });

  it("approves with the choices made, features it, and goes back to the queue", async () => {
    const api = fakeApi();
    await show(api);
    await click(/Constructions of Ikungi bus stand/);
    await type("District", "d-ikungi");
    await type("Skills wanted", "civil works, masonry");
    await act(async () => fireEvent.click(screen.getByLabelText("Feature it")));
    await click("Approve and publish");
    expect(api.approve).toHaveBeenCalledWith(
      "l1",
      expect.objectContaining({
        regionId: "r-singida",
        districtId: "d-ikungi",
        sectorId: "sec-construction",
        skills: ["civil works", "masonry"],
        closingOn: "2026-12-12",
        feature: true,
      }),
    );
    expect(screen.getByText(/Published, but not featured/)).toBeTruthy();
    expect(screen.queryByText("Constructions of Ikungi bus stand")).toBeNull();
  });

  it("asks a job for its employment type and shows the server's answer", async () => {
    const api = fakeApi({
      approve: vi.fn().mockResolvedValue({ result: "employment_type", featured: null }),
    });
    await show(api);
    await click(/Mwandishi mwendesha/);
    expect(screen.getByText("No translation yet. Type one, or leave it empty.")).toBeTruthy();
    expect(screen.getByLabelText("Title in English")).toBeTruthy();
    expect(screen.getByLabelText("Employment type")).toBeTruthy();
    await click("Approve and publish");
    expect(screen.getByText("Choose an employment type.")).toBeTruthy();
  });

  it("cannot feature when the slots are full", async () => {
    await show(fakeApi({ slots: vi.fn().mockResolvedValue({ used: 5, limit: 5 }) }));
    await click(/Constructions of Ikungi bus stand/);
    expect((screen.getByLabelText("Feature it") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("All featured slots are in use.")).toBeTruthy();
  });

  it("discards one listing from inside it", async () => {
    const api = fakeApi();
    await show(api);
    await click(/Mwandishi mwendesha/);
    await click("Discard");
    expect(api.discard).toHaveBeenCalledWith(["l2"]);
    expect(screen.getByText("1 listing discarded.")).toBeTruthy();
  });
});

describe("PublicListingsScreen sources (O20)", () => {
  const openSources = () =>
    act(async () => fireEvent.click(screen.getByRole("tab", { name: "Sources" })));

  it("shows each source's last run and error, and switches one off", async () => {
    const api = fakeApi({
      sources: vi
        .fn()
        .mockResolvedValue([
          source(),
          source({ id: "s-nest", name: "NeST", lastError: "nest.go.tz answered 500" }),
        ]),
    });
    await show(api);
    await openSources();
    expect(screen.getAllByText(/9 found/)).toHaveLength(2);
    expect(screen.getByText("The last run failed: nest.go.tz answered 500")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Switch off" })[0]!),
    );
    expect(api.setActive).toHaveBeenCalledWith("s-crdb", false);
    expect(screen.getByRole("button", { name: "Switch on" })).toBeTruthy();
  });

  it("shows a company waiting for a developer without a switch", async () => {
    await show(
      fakeApi({
        sources: vi.fn().mockResolvedValue([
          source({
            id: "s-nmb",
            name: "NMB Bank",
            active: false,
            readerReady: false,
            lastRunAt: null,
          }),
        ]),
      }),
    );
    await openSources();
    expect(screen.getByText("Waiting for a developer")).toBeTruthy();
    expect(screen.getByText("Not read yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch on" })).toBeNull();
  });

  it("adds a company, refusing an address that is not https", async () => {
    const api = fakeApi();
    await show(api);
    await openSources();
    await type("Company name", "NMB Bank");
    await type("Careers page address", "nmbbank.co.tz/careers");
    await click("Add the company");
    expect(
      screen.getByText("Enter a name and a web address that starts with https://."),
    ).toBeTruthy();
    expect(api.addSource).not.toHaveBeenCalled();
    await type("Careers page address", "https://www.nmbbank.co.tz/careers");
    await click("Add the company");
    expect(api.addSource).toHaveBeenCalledWith({
      name: "NMB Bank",
      pageUrl: "https://www.nmbbank.co.tz/careers",
      kind: "jobs",
    });
    expect(screen.getByText("Saved. It shows as waiting for a developer.")).toBeTruthy();
  });
});

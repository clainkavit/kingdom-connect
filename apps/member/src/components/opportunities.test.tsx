import "../test-router";
import { COMPUTER, PHONE, setWidth } from "../test-width";
import { stringsFor } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPPORTUNITY_PAGE,
  type OpportunityBrowseApi,
  type OpportunityCard,
  type OpportunityDetail,
} from "../lib/opportunity-browse";
import { OpportunitiesList, OpportunityDetailScreen, SavedOpportunities } from "./opportunities";

const en = stringsFor("en");

beforeEach(() => setWidth(COMPUTER));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const card = (over: Partial<OpportunityCard> = {}): OpportunityCard => ({
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
  skills: ["bookkeeping", "excel"],
  ...over,
});

const detail = (over: Partial<OpportunityDetail> = {}): OpportunityDetail => ({
  ...card(),
  description: "Keep the books for a coffee trading business in Moshi, full time.",
  status: "published",
  readOnly: false,
  ...over,
});

const fakeApi = (over: Partial<OpportunityBrowseApi> = {}): OpportunityBrowseApi => ({
  list: vi.fn().mockResolvedValue([card()]),
  mySkillCount: vi.fn().mockResolvedValue(0),
  savedIds: vi.fn().mockResolvedValue([]),
  setSaved: vi.fn().mockResolvedValue(true),
  saved: vi.fn().mockResolvedValue([]),
  detail: vi.fn().mockResolvedValue(detail()),
  tender: vi.fn().mockResolvedValue(null),
  documentLink: vi.fn().mockResolvedValue("https://files.test/tender.pdf"),
  sectors: vi.fn().mockResolvedValue([{ value: "s1", label: "Agriculture" }]),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Kilimanjaro" }]),
  ...over,
});

const show = (node: React.ReactElement) =>
  act(async () => {
    render(node);
  });

const press = (name: string | RegExp) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("OpportunitiesList (S16)", () => {
  it("lists posts with their type, role, poster, place and closing date", async () => {
    await show(<OpportunitiesList api={fakeApi()} />);
    expect(screen.getByText("Accountant for a coffee trader")).toBeTruthy();
    expect(screen.getByText("Accountant, Full-time")).toBeTruthy();
    expect(
      screen.getByText("Kilimanjaro Coffee Traders · Moshi, Kilimanjaro · Agriculture"),
    ).toBeTruthy();
    expect(screen.getByText("Closes 20 November 2026")).toBeTruthy();
  });

  it("marks a featured post and calls a tender a tender", async () => {
    await show(
      <OpportunitiesList
        api={fakeApi({
          list: vi.fn().mockResolvedValue([card({ id: "t1", type: "tender", featured: true })]),
        })}
      />,
    );
    expect(screen.getByText("Featured")).toBeTruthy();
    expect(screen.getAllByText("Tender").length).toBeGreaterThan(1);
  });

  it("filters by type, region, sector and posted date, starting again from page 0", async () => {
    const list = vi.fn().mockResolvedValue([card()]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    expect(list).toHaveBeenLastCalledWith({}, 0, false);

    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Tender" })));
    expect(list).toHaveBeenLastCalledWith({ kind: "tender", employment: undefined }, 0, false);
    expect(screen.queryByRole("button", { name: /^Employment type/ })).toBeNull();

    await press("Region: Any");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Kilimanjaro" })));
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ region: "r1" }), 0, false);

    await press("Posted: Any time");
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: "In the last 7 days" })),
    );
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "tender", region: "r1", postedWithin: 7 }),
      0,
      false,
    );
  });

  it("on a phone, keeps the filters behind one button and waits for Show results", async () => {
    setWidth(PHONE);
    const list = vi.fn().mockResolvedValue([card()]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    expect(screen.queryByRole("button", { name: "Region: Any" })).toBeNull();

    await press("Filters");
    await press("Region: Any");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Kilimanjaro" })));
    expect(list).toHaveBeenLastCalledWith({}, 0, false);

    await press("Show results");
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ region: "r1" }), 0, false);
    expect(screen.getByRole("button", { name: "Filters · 1" })).toBeTruthy();

    await press("Filters · 1");
    await press("Clear filters");
    expect(list).toHaveBeenLastCalledWith({ kind: undefined }, 0, false);
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("loads 20 more at a time", async () => {
    const full = Array.from({ length: OPPORTUNITY_PAGE }, (_, i) =>
      card({ id: `o${i}`, title: `Post ${i}` }),
    );
    const list = vi
      .fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([card({ id: "last", title: "The last post" })]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    await press("Load more");
    expect(list).toHaveBeenLastCalledWith({}, 1, false);
    expect(screen.getByText("The last post")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("tells an empty board from filters that match nothing", async () => {
    const list = vi.fn().mockResolvedValue([]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    expect(screen.getByText("No open opportunities yet")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Job" })));
    expect(screen.getByText("No opportunities match")).toBeTruthy();
  });

  it("offers a retry when loading fails", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([card()]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    await press("Try again");
    expect(screen.getByText("Accountant for a coffee trader")).toBeTruthy();
  });
});

describe("OpportunityDetailScreen (S17)", () => {
  it("shows the post, its facts and a way to report it", async () => {
    await show(<OpportunityDetailScreen api={fakeApi()} id="o1" />);
    expect(
      screen.getByText("Keep the books for a coffee trading business in Moshi, full time."),
    ).toBeTruthy();
    expect(screen.getByText("bookkeeping, excel")).toBeTruthy();
    expect(screen.getByText("Moshi, Kilimanjaro")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report" }).getAttribute("href")).toBe(
      "/report?type=opportunity&id=o1&member=m2",
    );
  });

  it("makes a closed post read-only, with no way to respond", async () => {
    const respond = vi.fn(() => <></>);
    await show(
      <OpportunityDetailScreen
        api={fakeApi({ detail: vi.fn().mockResolvedValue(detail({ readOnly: true })) })}
        id="o1"
        respond={respond}
      />,
    );
    expect(screen.getByText("This post is closed. You can read it but not respond.")).toBeTruthy();
    expect(respond).not.toHaveBeenCalled();
  });

  it("on a phone, keeps the way to respond in a bar at the bottom", async () => {
    setWidth(PHONE);
    await show(
      <OpportunityDetailScreen
        api={fakeApi()}
        id="o1"
        respond={() => <button type="button">Apply</button>}
      />,
    );
    const bar = screen.getByRole("button", { name: "Apply" }).parentElement!;
    expect(bar.style.position).toBe("sticky");
    expect(bar.previousElementSibling?.textContent).toBe(en.oppNoFeeNote);
  });

  it("says a hidden or reported post is not available", async () => {
    await show(
      <OpportunityDetailScreen
        api={fakeApi({ detail: vi.fn().mockResolvedValue(null) })}
        id="o1"
      />,
    );
    expect(screen.getByText("This post is not available")).toBeTruthy();
  });

  it("points the poster to My posts instead of reporting their own post", async () => {
    await show(
      <OpportunityDetailScreen
        api={fakeApi({ detail: vi.fn().mockResolvedValue(detail({ isMine: true })) })}
        id="o1"
      />,
    );
    expect(screen.getByText("This is your post. See it in My posts.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Report" })).toBeNull();
  });

  it("shows a tender's extra fields and opens its document (O04)", async () => {
    const documentLink = vi.fn().mockResolvedValue(null);
    await show(
      <OpportunityDetailScreen
        api={fakeApi({
          detail: vi.fn().mockResolvedValue(detail({ type: "tender", closingAt: "2026-12-02" })),
          tender: vi.fn().mockResolvedValue({
            issuingOrg: "Dodoma City Council",
            referenceNo: "DCC/PR/2026/114",
            scope: "Supply of 3,000 school uniform sets",
            eligibility: "Level 2 businesses",
            requiredDocuments: ["BRELA certificate", "TRA TIN certificate"],
            closingTime: "16:00:00",
            estimatedValue: 120000000,
            documentPath: "u/d.pdf",
          }),
          documentLink,
        })}
        id="o1"
      />,
    );
    expect(screen.getByText("Dodoma City Council")).toBeTruthy();
    expect(screen.getByText("DCC/PR/2026/114")).toBeTruthy();
    expect(screen.getByText("• BRELA certificate")).toBeTruthy();
    expect(screen.getByText("2 December 2026, 16:00")).toBeTruthy();
    expect(screen.getByText("TZS 120,000,000")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("link", { name: "Open the tender document (PDF)" })),
    );
    expect(documentLink).toHaveBeenCalledWith("u/d.pdf");
    expect(screen.getByText("We couldn't open the document. Try again.")).toBeTruthy();
  });
});

describe("Best matches and Newest (O11)", () => {
  it("opens on Best matches for a member with skills and shows how many skills fit", async () => {
    const list = vi.fn().mockResolvedValue([card({ skillsMatched: 2, skillsTotal: 3 })]);
    await show(
      <OpportunitiesList api={fakeApi({ list, mySkillCount: vi.fn().mockResolvedValue(4) })} />,
    );
    expect(list).toHaveBeenLastCalledWith({}, 0, true);
    expect(screen.getByRole("tab", { name: "Best matches" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("You have 2 of 3 skills")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Newest" })));
    expect(list).toHaveBeenLastCalledWith({}, 0, false);
  });

  it("opens on Newest without skills and asks for some", async () => {
    const list = vi.fn().mockResolvedValue([card()]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    expect(list).toHaveBeenLastCalledWith({}, 0, false);
    expect(screen.getByText("Add your skills to see the posts that fit you best.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add skills" }).getAttribute("href")).toBe(
      "/profile/edit",
    );
    expect(screen.queryByText(/You have \d of/)).toBeNull();
  });
});

describe("Saving opportunities (O10)", () => {
  it("saves a post from its card and counts it on the Saved link", async () => {
    const setSaved = vi.fn().mockResolvedValue(true);
    await show(<OpportunitiesList api={fakeApi({ setSaved })} />);
    expect(screen.getByRole("link", { name: "Saved · 0" })).toBeTruthy();
    await press("Save Accountant for a coffee trader");
    expect(setSaved).toHaveBeenCalledWith("o1", true);
    expect(screen.getByRole("link", { name: "Saved · 1" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove Accountant for a coffee trader from saved" }),
    ).toBeTruthy();
  });

  it("puts the bookmark back when saving fails", async () => {
    await show(<OpportunitiesList api={fakeApi({ setSaved: vi.fn().mockResolvedValue(false) })} />);
    await press("Save Accountant for a coffee trader");
    expect(screen.getByRole("link", { name: "Saved · 0" })).toBeTruthy();
  });

  it("shows Save and Saved on the post page, but not on your own post", async () => {
    await show(
      <OpportunityDetailScreen
        api={fakeApi({ savedIds: vi.fn().mockResolvedValue(["o1"]) })}
        id="o1"
      />,
    );
    expect(screen.getByText("Saved")).toBeTruthy();
    cleanup();
    await show(
      <OpportunityDetailScreen
        api={fakeApi({ detail: vi.fn().mockResolvedValue(detail({ isMine: true })) })}
        id="o1"
      />,
    );
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("lists saved posts, marks a closed one, and lets a gone one be removed", async () => {
    const setSaved = vi.fn().mockResolvedValue(true);
    const saved = vi.fn().mockResolvedValue([
      { id: "o1", savedAt: "2026-11-13", available: true, open: false, card: card() },
      { id: "o2", savedAt: "2026-11-12", available: false, open: false, card: null },
    ]);
    await show(<SavedOpportunities api={fakeApi({ saved, setSaved })} />);
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.getByText("Accountant for a coffee trader")).toBeTruthy();
    expect(screen.getByText("This post is no longer available.")).toBeTruthy();
    await press("Remove");
    expect(setSaved).toHaveBeenCalledWith("o2", false);
    expect(screen.queryByText("This post is no longer available.")).toBeNull();
  });

  it("says when nothing is saved yet", async () => {
    await show(<SavedOpportunities api={fakeApi()} />);
    expect(screen.getByText("Nothing saved yet")).toBeTruthy();
  });
});

describe("Opportunities layout (13 Nov 2026 redesign)", () => {
  it("on a computer, keeps better matches, your opportunities and stay safe in a side column", async () => {
    await show(<OpportunitiesList api={fakeApi()} />);
    expect(screen.getByRole("heading", { name: en.oppBetterMatches })).toBeTruthy();
    expect(screen.getByRole("heading", { name: en.oppYourSide })).toBeTruthy();
    expect(screen.getByRole("heading", { name: en.oppStaySafe })).toBeTruthy();
    expect(screen.getByRole("link", { name: en.myPostsTitle })).toBeTruthy();
    expect(screen.getByRole("link", { name: en.savedCount(0) })).toBeTruthy();
  });

  it("offers Clear filters once a filter is on, and clearing lists everything again", async () => {
    const api = fakeApi();
    await show(<OpportunitiesList api={api} />);
    expect(screen.queryByRole("button", { name: en.clearFilters })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: en.oppRemoteOnly })));
    await press(en.clearFilters);
    expect(api.list).toHaveBeenLastCalledWith({}, 0, false);
    expect(screen.queryByRole("button", { name: en.clearFilters })).toBeNull();
  });

  it("on a phone, has no side column; the links sit above the tabs", async () => {
    setWidth(PHONE);
    await show(<OpportunitiesList api={fakeApi()} />);
    expect(screen.queryByRole("heading", { name: en.oppStaySafe })).toBeNull();
    expect(screen.getByRole("link", { name: en.myPostsTitle })).toBeTruthy();
    expect(screen.getByText(en.oppNoFeeNote)).toBeTruthy();
  });
});

import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPPORTUNITY_PAGE,
  type OpportunityBrowseApi,
  type OpportunityCard,
  type OpportunityDetail,
} from "../lib/opportunity-browse";
import { OpportunitiesList, OpportunityDetailScreen } from "./opportunities";

function width(w: number) {
  Object.defineProperty(document.documentElement, "clientWidth", { value: w, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => width(1280));
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
    expect(list).toHaveBeenLastCalledWith({}, 0);

    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Tender" })));
    expect(list).toHaveBeenLastCalledWith({ kind: "tender", employment: undefined }, 0);
    expect(screen.queryByRole("button", { name: /^Employment type/ })).toBeNull();

    await press("Region: Any");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Kilimanjaro" })));
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ region: "r1" }), 0);

    await press("Posted: Any time");
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: "In the last 7 days" })),
    );
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "tender", region: "r1", postedWithin: 7 }),
      0,
    );
  });

  it("on a phone, keeps the filters behind one button and waits for Show results", async () => {
    width(390);
    const list = vi.fn().mockResolvedValue([card()]);
    await show(<OpportunitiesList api={fakeApi({ list })} />);
    expect(screen.queryByRole("button", { name: "Region: Any" })).toBeNull();

    await press("Filters");
    await press("Region: Any");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Kilimanjaro" })));
    expect(list).toHaveBeenLastCalledWith({}, 0);

    await press("Show results");
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ region: "r1" }), 0);
    expect(screen.getByRole("button", { name: "Filters · 1" })).toBeTruthy();

    await press("Filters · 1");
    await press("Clear filters");
    expect(list).toHaveBeenLastCalledWith({ kind: undefined }, 0);
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
    expect(list).toHaveBeenLastCalledWith({}, 1);
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

import "../test-router";
import { COMPUTER, PHONE, setWidth } from "../test-width";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  noBusinessFilters,
  noFilters,
  type BusinessCard,
  type DirectoryApi,
  type DirectoryCard,
} from "../lib/directory";
import { DirectoryScreen } from "./directory";

beforeEach(() => setWidth(COMPUTER));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const card = (over: Partial<DirectoryCard> = {}): DirectoryCard => ({
  memberId: "m1",
  fullName: "Zawadi Listed",
  headline: "Accountant in Mwanza",
  location: "Nyamagana, Mwanza",
  topSkills: ["bookkeeping", "excel", "tax"],
  business: false,
  photoUrl: null,
  relation: "none",
  ...over,
});

const fakeApi = (over: Partial<DirectoryApi> = {}): DirectoryApi => ({
  search: vi.fn().mockResolvedValue({ cards: [card()], more: false }),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Mwanza" }]),
  districts: vi.fn().mockResolvedValue([{ value: "d1", label: "Nyamagana" }]),
  sectors: vi.fn().mockResolvedValue([{ value: "s1", label: "Agriculture" }]),
  searchBusinesses: vi.fn().mockResolvedValue({ cards: [business()], more: false }),
  ...over,
});

function business(over: Partial<BusinessCard> = {}): BusinessCard {
  return {
    businessId: "b1",
    memberId: "o1",
    name: "Pendo Supplies",
    description: "Farm tools and seeds",
    size: "small",
    level: 3,
    sector: "Trade",
    ownerName: "Asha Owner",
    location: "Nyamagana, Mwanza",
    ...over,
  };
}

const openBusinesses = () =>
  act(async () => fireEvent.click(screen.getByRole("tab", { name: "Businesses" })));

async function show(api: DirectoryApi) {
  await act(async () => {
    render(<DirectoryScreen api={api} />);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("DirectoryScreen (S10), Businesses tab", () => {
  it("starts on Professionals and lists verified businesses on the Businesses tab", async () => {
    const api = fakeApi();
    await show(api);
    expect(screen.getByRole("tab", { name: "Professionals" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(api.searchBusinesses).not.toHaveBeenCalled();
    await openBusinesses();
    expect(api.searchBusinesses).toHaveBeenCalledWith(noBusinessFilters, 0, "en");
    const link = screen.getByRole("link", { name: /Pendo Supplies/ });
    expect(link.getAttribute("href")).toBe("/profile/o1");
    expect(screen.getByText("Farm tools and seeds")).toBeTruthy();
    expect(screen.getByText("Owner: Asha Owner")).toBeTruthy();
    expect(screen.getByText("Opportunity Poster")).toBeTruthy();
    expect(screen.getByText(/Trade/)).toBeTruthy();
    expect(screen.getByText("Nyamagana, Mwanza")).toBeTruthy();
  });

  it("searches and filters by sector, level and region", async () => {
    const api = fakeApi();
    await show(api);
    await openBusinesses();
    fireEvent.change(screen.getByLabelText("Search by business name or what it does"), {
      target: { value: "pendo" },
    });
    await click("Sector: Any");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Agriculture" })));
    await click("Level: Any");
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: "Opportunity Poster" })),
    );
    await click("Region: Any");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Mwanza" })));
    await click("Search");
    expect(api.searchBusinesses).toHaveBeenLastCalledWith(
      { q: "pendo", sector: "s1", level: 3, region: "r1" },
      0,
      "en",
    );
  });

  it("says when no business matches", async () => {
    await show(
      fakeApi({ searchBusinesses: vi.fn().mockResolvedValue({ cards: [], more: false }) }),
    );
    await openBusinesses();
    expect(screen.getByText("No business matches")).toBeTruthy();
  });
});

describe("DirectoryScreen (S10)", () => {
  it("lists cards with name, headline, location, top 3 skills, badge and Connect", async () => {
    const api = fakeApi();
    await show(api);
    expect(api.search).toHaveBeenCalledWith(noFilters, 0, "en");
    const link = screen.getByRole("link", { name: /Zawadi Listed/ });
    expect(link.getAttribute("href")).toBe("/profile/m1");
    expect(screen.getByText("Accountant in Mwanza")).toBeTruthy();
    expect(screen.getByText("Nyamagana, Mwanza")).toBeTruthy();
    expect(screen.getByText("tax")).toBeTruthy();
    expect(screen.getByText("Verified member")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect" }).getAttribute("href")).toBe(
      "/profile/m1?connect=1",
    );
  });

  it("shows where each card stands: sent, connected, or asked you", async () => {
    await show(
      fakeApi({
        search: vi.fn().mockResolvedValue({
          cards: [
            card({ memberId: "a", fullName: "Sent To", relation: "sent" }),
            card({ memberId: "b", fullName: "Already Friend", relation: "connected" }),
            card({ memberId: "c", fullName: "Asked Me", relation: "received" }),
          ],
          more: false,
        }),
      }),
    );
    expect(screen.getByText("Request sent")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Answer their request" }).getAttribute("href")).toBe(
      "/connections",
    );
    expect(screen.queryByRole("link", { name: "Connect" })).toBeNull();
  });

  it("searches with the typed words and filters", async () => {
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Search by name, profession or skill"), {
      target: { value: "excel" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Currently studying: Any" })),
    );
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Yes" })));
    await click("Search");
    expect(api.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "excel", studying: true }),
      0,
      "en",
    );
  });

  it("on a phone, keeps search open and folds the filters into one button", async () => {
    setWidth(PHONE);
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Search by name, profession or skill"), {
      target: { value: "excel" },
    });
    expect(screen.queryByRole("button", { name: "Currently studying: Any" })).toBeNull();
    await click("Filters");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Currently studying: Any" })),
    );
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Yes" })));
    await click("Show results");
    expect(api.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "excel", studying: true }),
      0,
      "en",
    );
    expect(screen.getByRole("button", { name: "Filters · 1" })).toBeTruthy();
  });

  it("loads the next page", async () => {
    const api = fakeApi({
      search: vi
        .fn()
        .mockResolvedValueOnce({ cards: [card()], more: true })
        .mockResolvedValueOnce({
          cards: [card({ memberId: "m2", fullName: "Second Person" })],
          more: false,
        }),
    });
    await show(api);
    await click("Load more");
    expect(api.search).toHaveBeenLastCalledWith(noFilters, 1, "en");
    expect(screen.getByText("Second Person")).toBeTruthy();
    expect(screen.getByText("Zawadi Listed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("says when no one matches and clears the filters", async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ cards: [], more: false }) });
    await show(api);
    expect(screen.getByText("No one matches")).toBeTruthy();
    await click("Clear filters");
    expect(api.search).toHaveBeenLastCalledWith(noFilters, 0, "en");
  });

  it("offers a retry when the directory cannot load", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ cards: [card()], more: false });
    await show(fakeApi({ search }));
    expect(screen.getByText(/couldn't load the directory/)).toBeTruthy();
    await click("Try again");
    expect(screen.getByText("Zawadi Listed")).toBeTruthy();
  });
});

describe("People layout (13 Nov 2026 redesign)", () => {
  const four = [
    card({ memberId: "a", fullName: "Joseph Mushi" }),
    card({ memberId: "b", fullName: "Zawadi Lyimo" }),
    card({ memberId: "c", fullName: "Pendo Massawe" }),
    card({ memberId: "d", fullName: "Emmanuel Kisanga" }),
  ];
  const rowOf = (name: string) =>
    screen.getByRole("link", { name: new RegExp(`^${name}`) }).parentElement!.parentElement!
      .parentElement!;

  it("on a wide computer screen, shows members three to a row", async () => {
    await show(fakeApi({ search: vi.fn().mockResolvedValue({ cards: four, more: false }) }));
    expect(rowOf("Joseph Mushi")).toBe(rowOf("Pendo Massawe"));
    expect(rowOf("Joseph Mushi")).not.toBe(rowOf("Emmanuel Kisanga"));
  });

  it("on a smaller computer screen, two to a row", async () => {
    setWidth(1000);
    await show(fakeApi({ search: vi.fn().mockResolvedValue({ cards: four, more: false }) }));
    expect(rowOf("Joseph Mushi")).toBe(rowOf("Zawadi Lyimo"));
    expect(rowOf("Joseph Mushi")).not.toBe(rowOf("Pendo Massawe"));
  });

  it("on a phone, one under another", async () => {
    setWidth(PHONE);
    await show(fakeApi({ search: vi.fn().mockResolvedValue({ cards: four, more: false }) }));
    const listOf = (name: string) =>
      screen.getByRole("link", { name: new RegExp(`^${name}`) }).parentElement!.parentElement!;
    expect(listOf("Joseph Mushi")).toBe(listOf("Emmanuel Kisanga"));
    expect(listOf("Joseph Mushi").children.length).toBe(4);
  });

  it("says contact details stay private, and links to My connections", async () => {
    await show(fakeApi());
    expect(
      screen.getByText(
        "Verified members of the community. Contact details stay private until you connect.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "My connections" }).getAttribute("href")).toBe(
      "/connections",
    );
  });
});

describe("Near you (R25)", () => {
  const cards = [
    card({ memberId: "a", fullName: "Joseph Mushi", near: "Mwanza" }),
    card({ memberId: "b", fullName: "Zawadi Lyimo", near: "Mwanza" }),
    card({ memberId: "c", fullName: "Baraka Dodoma", near: null }),
  ];

  it("with no search words, puts members in the reader's region under Near you, then the rest", async () => {
    await show(fakeApi({ search: vi.fn().mockResolvedValue({ cards, more: false }) }));
    const near = screen.getByRole("heading", { name: "Near you in Mwanza" });
    const more = screen.getByRole("heading", { name: "More members" });
    expect(near.parentElement!.textContent).toContain("Zawadi Lyimo");
    expect(near.parentElement!.textContent).not.toContain("Baraka Dodoma");
    expect(more.parentElement!.textContent).toContain("Baraka Dodoma");
  });

  it("shows no headings when nobody is near", async () => {
    await show(
      fakeApi({
        search: vi.fn().mockResolvedValue({ cards: [card({ near: null })], more: false }),
      }),
    );
    expect(screen.queryByRole("heading", { name: /Near you/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "More members" })).toBeNull();
  });

  it("shows no headings once search words are typed", async () => {
    await act(async () => {
      render(
        <DirectoryScreen
          api={fakeApi({ search: vi.fn().mockResolvedValue({ cards, more: false }) })}
          initialQuery="bookkeeping"
        />,
      );
    });
    expect(screen.queryByRole("heading", { name: /Near you/ })).toBeNull();
  });
});

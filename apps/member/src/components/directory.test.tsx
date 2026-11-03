import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { noFilters, type DirectoryApi, type DirectoryCard } from "../lib/directory";
import { DirectoryScreen } from "./directory";

afterEach(cleanup);

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
  ...over,
});

async function show(api: DirectoryApi) {
  await act(async () => {
    render(<DirectoryScreen api={api} />);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

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

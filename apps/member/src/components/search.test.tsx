import "../test-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchDeps } from "../lib/search";
import { SearchScreen } from "./search";

afterEach(cleanup);

const person = (i: number) => ({
  memberId: `m${i}`,
  fullName: `Person ${i}`,
  headline: "Bookkeeper",
  location: "Mwanza",
  topSkills: ["bookkeeping"],
  business: false,
  photoUrl: null,
  relation: "none" as const,
});

const post = {
  id: "o1",
  type: "job",
  title: "Bookkeeper for a shop",
  role: null,
  employmentType: "full_time",
  remote: true,
  region: null,
  district: null,
  sector: { en: "Retail", sw: "Rejareja" },
  closingAt: "2026-12-12",
  featured: false,
  posterId: "m9",
  posterName: "Kirumba Hardware",
  isMine: false,
  skills: [],
};

const deps = (over: Partial<SearchDeps> = {}): SearchDeps => ({
  directory: {
    search: vi.fn().mockResolvedValue({ cards: [1, 2, 3, 4, 5, 6].map(person), more: false }),
  },
  opportunities: { search: vi.fn().mockResolvedValue([post]) },
  training: {
    search: vi
      .fn()
      .mockResolvedValue([
        { id: "t1", title: "Bookkeeping basics", provider: "Mkuyuni", status: "published" },
      ]),
  },
  ...over,
});

const show = (q: string, d: SearchDeps) =>
  act(async () => {
    render(<SearchScreen q={q} deps={d} />);
  });

describe("SearchScreen (R22)", () => {
  it("shows people, opportunities and training that match, each with a count", async () => {
    await show("book", deps());
    expect(screen.getByRole("heading", { name: 'Results for "book"' })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "People · 5" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Opportunities · 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Training · 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all in People" }).getAttribute("href")).toBe(
      "/people?q=book",
    );
    expect(screen.getByRole("link", { name: "Bookkeeping basics" }).getAttribute("href")).toBe(
      "/training/t1",
    );
  });

  it("asks for at least 2 letters before searching", async () => {
    const d = deps();
    await show("b", d);
    expect(screen.getByText("Type at least 2 letters to search.")).toBeTruthy();
    expect(d.directory.search).not.toHaveBeenCalled();
  });

  it("says when nothing matched", async () => {
    await show(
      "zzz",
      deps({
        directory: { search: vi.fn().mockResolvedValue({ cards: [], more: false }) },
        opportunities: { search: vi.fn().mockResolvedValue([]) },
        training: { search: vi.fn().mockResolvedValue([]) },
      }),
    );
    expect(screen.getByText('Nothing found for "zzz". Try fewer or different words.')).toBeTruthy();
  });

  it("offers a retry when the search fails", async () => {
    await show(
      "book",
      deps({ directory: { search: vi.fn().mockRejectedValue(new Error("offline")) } }),
    );
    expect(
      screen.getByText("Search did not work. Check your connection and try again."),
    ).toBeTruthy();
  });
});

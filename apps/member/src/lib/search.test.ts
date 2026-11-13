import { describe, expect, it, vi } from "vitest";
import { noFilters } from "./directory";
import { matchesQuery, searchEverything, type SearchDeps } from "./search";

describe("matchesQuery", () => {
  it("needs every word, in any order and case", () => {
    expect(matchesQuery("Book KEEP", ["Bookkeeper for a shop"])).toBe(true);
    expect(matchesQuery("shop driver", ["Bookkeeper for a shop"])).toBe(false);
    expect(matchesQuery("excel", ["Accountant", null, "excel"])).toBe(true);
    expect(matchesQuery("  ", ["anything"])).toBe(false);
  });
});

describe("searchEverything (R22)", () => {
  const card = (id: string, title: string, skills: string[] = []) =>
    ({ id, title, role: null, posterName: "Kirumba Hardware", skills }) as never;

  const deps = (over: Partial<SearchDeps> = {}): SearchDeps => ({
    directory: {
      search: vi.fn().mockResolvedValue({
        cards: Array.from({ length: 6 }, (_, i) => ({ memberId: `m${i}` })),
        more: false,
      }),
    },
    opportunities: {
      list: vi
        .fn()
        .mockResolvedValueOnce([card("o1", "Bookkeeper for a shop"), card("o2", "Driver")])
        .mockResolvedValueOnce([card("o3", "Sales", ["bookkeeping"])])
        .mockResolvedValue([]),
    },
    training: {
      feed: vi.fn().mockResolvedValue([
        { id: "t1", title: "Bookkeeping basics", provider: "", status: "published" },
        { id: "t2", title: "Bookkeeping draft", provider: "", status: "draft" },
      ]),
    },
    ...over,
  });

  it("asks the directory with the words and keeps the first five people", async () => {
    const d = deps();
    const results = await searchEverything(" book ", "en", d);
    expect(d.directory.search).toHaveBeenCalledWith({ ...noFilters, q: "book" }, 0, "en");
    expect(results.people).toHaveLength(5);
    expect(results.morePeople).toBe(true);
  });

  it("matches opportunities on title and skills across the newest pages, and published training only", async () => {
    const results = await searchEverything("book", "en", deps());
    expect(results.opportunities.map((o) => o.id)).toEqual(["o1", "o3"]);
    expect(results.training.map((t) => t.id)).toEqual(["t1"]);
  });
});

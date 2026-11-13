import { describe, expect, it, vi } from "vitest";
import { noFilters } from "./directory";
import { searchEverything, type SearchDeps } from "./search";

vi.mock("./supabase", () => ({ supabase: {} }));

describe("searchEverything (R22, R23)", () => {
  const deps = (): SearchDeps => ({
    directory: {
      search: vi.fn().mockResolvedValue({
        cards: Array.from({ length: 6 }, (_, i) => ({ memberId: `m${i}` })),
        more: false,
      }),
    },
    opportunities: { search: vi.fn().mockResolvedValue([{ id: "o1" }]) },
    training: { search: vi.fn().mockResolvedValue([{ id: "t1" }]) },
  });

  it("sends the trimmed words to each search and keeps the first five people", async () => {
    const d = deps();
    const results = await searchEverything(" book keeper ", "en", d);
    expect(d.directory.search).toHaveBeenCalledWith({ ...noFilters, q: "book keeper" }, 0, "en");
    expect(d.opportunities.search).toHaveBeenCalledWith("book keeper");
    expect(d.training.search).toHaveBeenCalledWith("book keeper");
    expect(results.people).toHaveLength(5);
    expect(results.morePeople).toBe(true);
    expect(results.opportunities.map((o) => o.id)).toEqual(["o1"]);
    expect(results.training.map((t) => t.id)).toEqual(["t1"]);
  });
});

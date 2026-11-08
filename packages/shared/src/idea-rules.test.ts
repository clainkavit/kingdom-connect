import { describe, expect, it } from "vitest";
import { checkIdea, parseTzs, type IdeaDraft } from "./idea-rules";

const draft = (over: Partial<IdeaDraft> = {}): IdeaDraft => ({
  title: "Solar dryers for fruit farmers",
  problem: "Farmers lose much of their mango harvest before it reaches market.",
  sectorId: "s1",
  stage: "prototype",
  seeking: "investor",
  investmentMin: "10,000,000",
  investmentMax: "50000000",
  showOwner: true,
  description: "A low-cost solar dryer built from local materials for farm groups to share.",
  businessModel: "",
  market: "",
  financials: "",
  team: "",
  ...over,
});

describe("parseTzs", () => {
  it("reads amounts with separators", () => {
    expect(parseTzs("10,000,000")).toBe(10_000_000);
    expect(parseTzs(" 5 000 000 ")).toBe(5_000_000);
    expect(parseTzs("")).toBeNull();
    expect(parseTzs("ten million")).toBeNaN();
  });
});

describe("checkIdea", () => {
  it("accepts a complete idea, with or without a range", () => {
    expect(checkIdea(draft())).toBeNull();
    expect(checkIdea(draft({ investmentMin: "", investmentMax: "" }))).toBeNull();
  });

  it("names the first problem", () => {
    expect(checkIdea(draft({ title: "Hi" }))).toBe("title");
    expect(checkIdea(draft({ problem: "Too short" }))).toBe("problem");
    expect(checkIdea(draft({ sectorId: "" }))).toBe("sector");
    expect(checkIdea(draft({ stage: "" }))).toBe("stage");
    expect(checkIdea(draft({ seeking: "" }))).toBe("seeking");
    expect(checkIdea(draft({ investmentMin: "60000000" }))).toBe("range");
    expect(checkIdea(draft({ investmentMax: "lots" }))).toBe("range");
    expect(checkIdea(draft({ description: "Short" }))).toBe("description");
    expect(checkIdea(draft({ team: "x".repeat(3001) }))).toBe("detail_too_long");
  });
});

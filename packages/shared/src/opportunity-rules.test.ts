import { describe, expect, it } from "vitest";
import {
  documentLines,
  emptyTender,
  opportunityProblem,
  parseSkills,
  type OpportunityInput,
} from "./opportunity-rules";

const input = (over: Partial<OpportunityInput> = {}): OpportunityInput => ({
  type: "job",
  title: "Site supervisor",
  role: "",
  employmentType: "full_time",
  remote: false,
  regionId: "r1",
  districtId: "",
  sectorId: "s1",
  description: "x".repeat(120),
  closingOn: "2026-12-01",
  skills: ["supervision"],
  noFee: true,
  tender: emptyTender,
  ...over,
});
const member = { staff: false, today: "2026-11-06" };

describe("opportunityProblem (S20, PRD section 10)", () => {
  it("accepts a complete job", () => {
    expect(opportunityProblem(input(), member)).toBeNull();
  });

  it("checks each field the way the server does", () => {
    expect(opportunityProblem(input({ type: "" }), member)).toBe("invalid_type");
    expect(opportunityProblem(input({ title: "Hi" }), member)).toBe("invalid_title");
    expect(opportunityProblem(input({ employmentType: "" }), member)).toBe("invalid_employment");
    expect(opportunityProblem(input({ type: "partnership" }), member)).toBe("invalid_employment");
    expect(opportunityProblem(input({ regionId: "" }), member)).toBe("invalid_location");
    expect(opportunityProblem(input({ regionId: "", remote: true }), member)).toBeNull();
    expect(opportunityProblem(input({ sectorId: "" }), member)).toBe("invalid_sector");
    expect(opportunityProblem(input({ description: "short" }), member)).toBe("too_short");
    expect(opportunityProblem(input({ description: "x".repeat(5001) }), member)).toBe("too_long");
    expect(opportunityProblem(input({ closingOn: "2026-11-06" }), member)).toBe("invalid_closing");
    expect(opportunityProblem(input({ closingOn: "2027-02-05" }), member)).toBe("invalid_closing");
    expect(opportunityProblem(input({ closingOn: "2027-02-04" }), member)).toBeNull();
    expect(opportunityProblem(input({ skills: [] }), member)).toBe("skills_required");
    expect(
      opportunityProblem(input({ type: "investment", employmentType: "", skills: [] }), member),
    ).toBeNull();
    expect(opportunityProblem(input({ skills: ["a", "b", "c", "d", "e", "f"] }), member)).toBe(
      "too_many_skills",
    );
  });

  it("needs the no-fee tick from members but not from staff", () => {
    expect(opportunityProblem(input({ noFee: false }), member)).toBe("no_fee_required");
    expect(opportunityProblem(input({ noFee: false }), { ...member, staff: true })).toBeNull();
  });
});

describe("parseSkills", () => {
  it("splits on commas, lowercases, trims and removes repeats", () => {
    expect(parseSkills(" Civil  Works, supervision,,civil works ")).toEqual([
      "civil works",
      "supervision",
    ]);
  });
});

describe("tenders (O04)", () => {
  const tender = (over: Partial<OpportunityInput["tender"]> = {}) =>
    input({
      type: "tender",
      employmentType: "",
      skills: [],
      tender: {
        ...emptyTender,
        referenceNo: "DCC/PR/2026/114",
        scope: "Supply of 3,000 school uniform sets for twelve primary schools.",
        ...over,
      },
    });

  it("accepts a complete tender", () => {
    expect(opportunityProblem(tender(), member)).toBeNull();
  });

  it("needs a reference number and a scope of at least 30 characters", () => {
    expect(opportunityProblem(tender({ referenceNo: "D" }), member)).toBe("invalid_tender");
    expect(opportunityProblem(tender({ scope: "Uniforms" }), member)).toBe("invalid_tender");
  });

  it("checks the closing time, the value and the documents", () => {
    expect(opportunityProblem(tender({ closingTime: "25:00" }), member)).toBe("invalid_tender");
    expect(opportunityProblem(tender({ estimatedValue: "about 5M" }), member)).toBe(
      "invalid_tender",
    );
    expect(opportunityProblem(tender({ estimatedValue: "120,000,000" }), member)).toBeNull();
    const eleven = Array.from({ length: 11 }, (_, i) => `Document ${i}`).join("\n");
    expect(opportunityProblem(tender({ requiredDocuments: eleven }), member)).toBe(
      "invalid_tender",
    );
  });

  it("reads one required document per line", () => {
    expect(documentLines(" BRELA certificate \n\nTRA TIN certificate")).toEqual([
      "BRELA certificate",
      "TRA TIN certificate",
    ]);
  });
});

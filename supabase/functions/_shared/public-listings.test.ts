import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AJIRA_PAGE,
  councilDistrict,
  CRDB_PAGE,
  guessSector,
  NEST_PAGE,
  geminiAdvertRequest,
  readAdvertPosts,
  readAjiraAdverts,
  readTranslations,
  readAjira,
  readCrdb,
  readNest,
  readNestEntity,
  TENDER_FEE_NOTE,
} from "./public-listings.ts";

const sample = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../import-public-listings/fixtures/${name}`, import.meta.url), "utf8"),
  );

describe("readNest (O19)", () => {
  it("turns published tenders into listings with the fee note and the deadline", () => {
    const { listings, entities, hasNext } = readNest(sample("nest-tenders.json"));
    expect(hasNext).toBe(true);
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      external_id: "6300da6b-1936-492b-9aa1-c5bcd56157d1",
      title: "Supply of pipes and fittings for CBWSOs at Kwimba District in Mwanza Region",
      employer: "RUWASA - MWANZA REGIONAL OFFICE",
      summary: "Goods, Closed Framework Contracts for Supplies of Goods",
      details: { reference_no: "FA/2026/2027/61162/TR140/015/G/02", type: "FRAMEWORK" },
      original_url: NEST_PAGE,
      language: "en",
      opens_on: "2026-11-27",
      closing_on: "2026-12-04",
      closing_time: "14:00",
      fee_note: TENDER_FEE_NOTE,
    });
    expect(entities).toContain("16534d19-8f49-44e2-87c7-765f6e95e60e");
  });

  it("reads the procuring body's region and district", () => {
    expect(readNestEntity(sample("nest-entity.json"))).toEqual({
      region: "SINGIDA",
      district: "IKUNGI",
    });
  });

  it("refuses an answer it does not recognise, so the run is marked failed", () => {
    expect(() => readNest({ errors: [{ message: "down" }] })).toThrow(/unexpected shape/);
  });
});

describe("readAjira (O19)", () => {
  it("keeps open vacancies only, with the council's district", () => {
    const listings = readAjira(sample("ajira-vacancies.json"));
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      external_id: "14564",
      title: "MWANDISHI MWENDESHA OFISI DARAJA LA II (OFFICE MANAGEMENT SECRETARY GRADE II)",
      employer: "Halmashauri ya Wilaya ya Siha",
      details: { posts: 4 },
      original_url: AJIRA_PAGE,
      language: "sw",
      closing_on: "2026-12-10",
      district: "Siha",
      sector: "Professional services",
    });
  });

  it("finds the district in each kind of council name", () => {
    expect(councilDistrict("Halmashauri ya Jiji la Mbeya")).toBe("Mbeya");
    expect(councilDistrict("Halmashauri ya Mji Mbulu")).toBe("Mbulu");
    expect(councilDistrict("Shirika la Posta Tanzania (TPC)")).toBeUndefined();
  });
});

describe("readCrdb (O19)", () => {
  it("turns CRDB's open jobs into listings", () => {
    const listings = readCrdb(sample("crdb-jobs.json"));
    expect(listings.length).toBe(9);
    expect(listings[0]).toMatchObject({
      external_id: "2611",
      title: "MANAGER INTEGRATION SERVICES",
      employer: "CRDB Bank",
      summary: "DEPARTMENT OF ICT, Tanzania Head Office",
      original_url: CRDB_PAGE,
      closing_on: "2026-12-06",
      sector: "ICT",
    });
  });
});

describe("guessSector (O19)", () => {
  it("reads English and Swahili words", () => {
    expect(guessSector("Constructions of Ikungi bus stand, Works")).toBe("Construction");
    expect(guessSector("Mhasibu daraja la II")).toBe("Finance");
    expect(guessSector("Mwalimu wa shule ya msingi")).toBe("Education");
    expect(guessSector("Procurement of consumable medical supplies for hospital")).toBe("Health");
    expect(guessSector("Supply of pipes and fittings")).toBeUndefined();
  });
});

const geminiAnswer = (value: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: "STOP" }],
});

describe("readAjiraAdverts (O19)", () => {
  it("lists the newest advert PDFs", () => {
    const adverts = readAjiraAdverts(sample("ajira-adverts.json"));
    expect(adverts.length).toBe(5);
    expect(adverts[0]).toEqual({
      id: "0109dc0b-6421-4de6-9f9d-7047ecd7c9cb",
      title: "TANGAZO LA NAFASI ZA KAZI HALMASHAURI YA WILAYA YA SIHA",
      published_on: "2026-11-27",
      token: "83d7a300-4075-4202-9a41-86515d469065",
    });
  });
});

describe("readAdvertPosts (O19)", () => {
  const advert = {
    id: "0109dc0b-6421-4de6-9f9d-7047ecd7c9cb",
    title: "TANGAZO LA NAFASI ZA KAZI HALMASHAURI YA WILAYA YA SIHA",
    published_on: "2026-11-27",
    token: "t",
  };

  it("sends the PDF to Gemini and asks for every post with a translation", () => {
    const request = geminiAdvertRequest("UERG", advert.title);
    expect(request.contents[0]!.parts[0]).toEqual({
      inline_data: { mime_type: "application/pdf", data: "UERG" },
    });
    expect(request.generationConfig.responseMimeType).toBe("application/json");
  });

  it("turns each post Gemini found into a listing with its own id", () => {
    const listings = readAdvertPosts(
      geminiAnswer({
        posts: [
          {
            title: "Mwandishi Mwendesha Ofisi Daraja la II",
            employer: "Halmashauri ya Wilaya ya Siha",
            number_of_posts: 4,
            closing_date: "2026-12-10",
            region: "Kilimanjaro",
            district: null,
            language: "sw",
            summary: "Kidato cha nne na stashahada ya uhazili",
            title_translated: "Office Management Secretary Grade II",
            summary_translated: "Form four and a diploma in secretarial studies",
          },
          { title: "Dereva Daraja la II", language: "sw", closing_date: "2026-12-10" },
        ],
      }),
      advert,
    );
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      external_id: "0109dc0b-6421-4de6-9f9d-7047ecd7c9cb#1",
      title: "Mwandishi Mwendesha Ofisi Daraja la II",
      employer: "Halmashauri ya Wilaya ya Siha",
      details: { posts: 4 },
      language: "sw",
      opens_on: "2026-11-27",
      closing_on: "2026-12-10",
      region: "Kilimanjaro",
      district: "Siha",
      sector: "Professional services",
      translated_title: "Office Management Secretary Grade II",
    });
    expect(listings[1]).toMatchObject({
      external_id: "0109dc0b-6421-4de6-9f9d-7047ecd7c9cb#2",
      sector: "Transport and logistics",
    });
  });

  it("fails the advert when Gemini gives nothing", () => {
    expect(() => readAdvertPosts({ candidates: [] }, advert)).toThrow(/no answer/);
  });
});

describe("readTranslations (O19)", () => {
  it("matches translations to the inputs by position", () => {
    expect(readTranslations(geminiAnswer(["Driver Grade II", "Meneja wa huduma"]), 2)).toEqual([
      "Driver Grade II",
      "Meneja wa huduma",
    ]);
  });

  it("gives nothing when the count does not match or the answer is not JSON", () => {
    expect(readTranslations(geminiAnswer(["only one"]), 2)).toEqual([undefined, undefined]);
    expect(
      readTranslations({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }, 1),
    ).toEqual([undefined]);
  });
});

import { describe, expect, it } from "vitest";
import { latin1, stampLine } from "./stamp-line.ts";

describe("the idea file stamp", () => {
  it("names the viewer, the Tanzania date and that it is confidential", () => {
    expect(stampLine("Neema Joseph", new Date("2026-11-07T22:30:00Z"), "Kingdom Connect")).toBe(
      "Neema Joseph · 8 Nov 2026 · Kingdom Connect · Confidential",
    );
  });

  it("turns characters the PDF font cannot draw into a question mark", () => {
    expect(latin1("Zoë 李")).toBe("Zoë ?");
  });
});

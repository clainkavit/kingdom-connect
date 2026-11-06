import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LicenceItem, ReverificationApi } from "@/lib/reverification";
import { Reverification } from "./reverification";

afterEach(cleanup);

const item = (over: Partial<LicenceItem>): LicenceItem => ({
  businessId: "b1",
  name: "Pendo Supplies",
  ownerUsername: "pendo_owner",
  ownerName: "Pendo Owner",
  level: 2,
  expired: false,
  expiresOn: "2026-11-20",
  renewal: null,
  ...over,
});

async function show(list: ReverificationApi["list"]) {
  await act(async () => {
    render(<Reverification api={{ list }} />);
  });
}

describe("Reverification (A08)", () => {
  it("lists expired licences, then licences ending soon, with any renewal waiting", async () => {
    await show(
      vi.fn().mockResolvedValue([
        item({
          businessId: "b1",
          name: "Lapsed Builders",
          level: 3,
          expired: true,
          expiresOn: "2026-11-01",
          renewal: { id: "r1", status: "pending" },
        }),
        item({ businessId: "b2", name: "Pendo Supplies" }),
        item({
          businessId: "b3",
          name: "Refused Renewal",
          renewal: { id: "r3", status: "rejected" },
        }),
      ]),
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Expired", "Ending in the next 30 days"]);
    expect(screen.getByText("Licence ends 2026-11-01")).toBeTruthy();
    expect(screen.getByText(/Business, Level 3/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Renewal waiting" }).getAttribute("href")).toBe(
      "/verification/business/r1",
    );
    expect(screen.getByText("No renewal sent yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Last renewal rejected" }).getAttribute("href")).toBe(
      "/verification/business/r3",
    );
  });

  it("says when no licence is ending", async () => {
    await show(vi.fn().mockResolvedValue([]));
    expect(screen.getByText("No licence is ending")).toBeTruthy();
  });
});

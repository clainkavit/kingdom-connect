import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessReviewApi, BusinessReviewData } from "@/lib/business-review";
import { BusinessReview } from "./business-review";

afterEach(cleanup);

const data = (over: Partial<BusinessReviewData> = {}): BusinessReviewData => ({
  id: "q1",
  pending: true,
  status: "pending",
  reason: null,
  submittedAt: new Date("2026-11-05T09:00:00+03:00"),
  ownerName: "Asha Owner",
  ownerUsername: "asha_owner",
  name: "Asha Traders",
  sector: { en: "Agriculture", sw: "Kilimo" },
  size: "small",
  description: "Sells farm tools",
  brelaNo: "BRELA-1",
  tin: "123-456-789",
  licenceNo: "LIC-1",
  licenceExpiresOn: "2027-06-30",
  documents: [
    { kind: "brela", url: "https://files.test/brela", isPdf: false },
    { kind: "tin", url: "https://files.test/tin.pdf", isPdf: true },
    { kind: "licence", url: "https://files.test/licence", isPdf: false },
  ],
  ...over,
});

const fakeApi = (over: Partial<BusinessReviewApi> = {}): BusinessReviewApi => ({
  load: vi.fn().mockResolvedValue(data()),
  reasons: vi.fn().mockResolvedValue([
    { code: "tin_mismatch", label: "The TIN does not match the TRA certificate", needsNote: false },
    { code: "other", label: "Another reason, explained in the note", needsNote: true },
  ]),
  decide: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(api: BusinessReviewApi) {
  await act(async () => {
    render(<BusinessReview id="q1" api={api} />);
  });
}

describe("BusinessReview", () => {
  it("shows the details and the three documents, with a PDF as a link", async () => {
    await show(fakeApi());
    expect(screen.getByText("Asha Traders")).toBeTruthy();
    expect(screen.getByText("BRELA-1")).toBeTruthy();
    expect(screen.getByText("123-456-789")).toBeTruthy();
    expect(screen.getByRole("img", { name: "BRELA certificate" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open TRA TIN certificate" }).getAttribute("href"),
    ).toBe("https://files.test/tin.pdf");
    expect(screen.getByRole("img", { name: "Business licence" })).toBeTruthy();
  });

  it("approves", async () => {
    const api = fakeApi();
    await show(api);
    await click("Approve");
    expect(api.decide).toHaveBeenCalledWith("q1", true, "", "");
    expect(screen.getByText("Approved. The Member has been told.")).toBeTruthy();
  });

  it("rejects with a preset reason, and needs a note for another reason", async () => {
    const api = fakeApi();
    await show(api);
    await click("Reject");
    await click("Reject and send the reason");
    expect(screen.getByRole("alert").textContent).toBe(
      "Choose a reason. For another reason, write a note.",
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("radio", { name: "Another reason, explained in the note" })),
    );
    await click("Reject and send the reason");
    expect(api.decide).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("radio", { name: "The TIN does not match the TRA certificate" }),
      ),
    );
    await click("Reject and send the reason");
    expect(api.decide).toHaveBeenCalledWith("q1", false, "tin_mismatch", "");
    expect(screen.getByText("Rejected. The Member has been told the reason.")).toBeTruthy();
  });

  it("says when another Administrator already decided", async () => {
    await show(fakeApi({ decide: vi.fn().mockResolvedValue("already_decided") }));
    await click("Approve");
    expect(screen.getByRole("alert").textContent).toBe(
      "Another Administrator has already decided this application.",
    );
  });

  it("shows a decided request without the buttons", async () => {
    await show(
      fakeApi({ load: vi.fn().mockResolvedValue(data({ pending: false, status: "approved" })) }),
    );
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

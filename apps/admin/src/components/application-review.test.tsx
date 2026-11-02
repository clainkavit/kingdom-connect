import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Application, VerificationApi } from "@/lib/verification";
import { ApplicationReview } from "./application-review";

afterEach(cleanup);

const application = (over: Partial<Application> = {}): Application => ({
  id: "r1",
  memberId: "m1",
  pending: true,
  submittedAt: new Date("2026-11-09T09:00:00+03:00"),
  username: "test_applicant",
  fullName: "Test Applicant",
  category: "professional",
  categoryDetails: { profession: "Nurse" },
  sectorName: null,
  region: "Mwanza",
  district: "Ilemela",
  address: "Plot 1",
  phone: "+255700000001",
  email: "test.applicant@example.test",
  study: { institution: null, course: null, year: null },
  idType: "nida",
  idExpiresOn: null,
  facePhotoUrl: "https://photos.test/face",
  idPhotoUrl: "https://photos.test/id",
  duplicate: null,
  ...over,
});

const fakeApi = (over: Partial<VerificationApi> = {}): VerificationApi => ({
  queue: vi.fn(),
  application: vi.fn().mockResolvedValue(application()),
  reasons: vi.fn().mockResolvedValue([
    { code: "id_expired", label: "The ID has expired", needsNote: false },
    { code: "other", label: "Another reason, explained in the note", needsNote: true },
  ]),
  decide: vi.fn().mockResolvedValue({ kind: "done" }),
  markDuplicate: vi.fn().mockResolvedValue({ kind: "done" }),
  revealIdNumber: vi.fn().mockResolvedValue("19900101123456789012"),
  ...over,
});

async function show(api: VerificationApi, today = new Date("2026-11-10T12:00:00+03:00")) {
  await act(async () => {
    render(<ApplicationReview id="r1" api={api} today={today} />);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("ApplicationReview (A03)", () => {
  it("shows the face photo and ID photo side by side with the form details", async () => {
    await show(fakeApi());
    expect(screen.getByRole("img", { name: "Face photo" }).getAttribute("src")).toBe(
      "https://photos.test/face",
    );
    expect(screen.getByRole("img", { name: "ID photo" }).getAttribute("src")).toBe(
      "https://photos.test/id",
    );
    expect(screen.getAllByText("Test Applicant").length).toBeGreaterThan(0);
    expect(screen.getByText("NIDA")).toBeTruthy();
    expect(screen.getByText("Nurse")).toBeTruthy();
  });

  it("hides the ID number until staff reveal it", async () => {
    const api = fakeApi();
    await show(api);
    expect(screen.queryByText("19900101123456789012")).toBeNull();
    await click("Reveal ID number");
    expect(api.revealIdNumber).toHaveBeenCalledWith("m1");
    expect(screen.getByText("19900101123456789012")).toBeTruthy();
  });

  it("warns when the ID has expired", async () => {
    await show(
      fakeApi({
        application: vi.fn().mockResolvedValue(application({ idExpiresOn: "2026-11-01" })),
      }),
    );
    expect(screen.getByText("This ID has expired.")).toBeTruthy();
  });

  it("shows both face photos for a suspected duplicate", async () => {
    await show(
      fakeApi({
        application: vi.fn().mockResolvedValue(
          application({
            duplicate: { username: "test_level1", facePhotoUrl: "https://photos.test/other" },
          }),
        ),
      }),
    );
    expect(
      screen.getByText("Suspected duplicate of @test_level1. Compare the face photos."),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: "Face photo of @test_level1" })).toBeTruthy();
  });

  it("marks a suspected duplicate by username", async () => {
    const api = fakeApi({ markDuplicate: vi.fn().mockResolvedValue({ kind: "unknown_member" }) });
    await show(api);
    fireEvent.change(screen.getByLabelText("Suspected duplicate of (username)"), {
      target: { value: "nobody" },
    });
    await click("Mark as duplicate");
    expect(api.markDuplicate).toHaveBeenCalledWith("r1", "nobody");
    expect(screen.getByText("No other member has that username.")).toBeTruthy();
  });

  it("approves", async () => {
    const api = fakeApi();
    await show(api);
    await click("Approve");
    expect(api.decide).toHaveBeenCalledWith({ requestId: "r1", decision: "approved" });
    expect(screen.getByText("Approved. The applicant has been told.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("will not reject without a reason, and needs a note for another reason", async () => {
    const api = fakeApi();
    await show(api);
    await click("Reject");
    await click("Reject and send the reason");
    expect(api.decide).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a reason. For another reason, write a note.")).toBeTruthy();

    await act(async () =>
      fireEvent.click(screen.getByRole("radio", { name: "Another reason, explained in the note" })),
    );
    await click("Reject and send the reason");
    expect(api.decide).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Note for the applicant"), {
      target: { value: "The photo is of a different document" },
    });
    await click("Reject and send the reason");
    expect(api.decide).toHaveBeenCalledWith({
      requestId: "r1",
      decision: "rejected",
      reasonCode: "other",
      note: "The photo is of a different document",
    });
    expect(screen.getByText("Rejected. The applicant has been told the reason.")).toBeTruthy();
  });

  it("says when another admin decided first", async () => {
    await show(fakeApi({ decide: vi.fn().mockResolvedValue({ kind: "already_decided" }) }));
    await click("Approve");
    expect(screen.getByRole("alert").textContent).toBe(
      "Another Administrator has already decided this application.",
    );
  });

  it("offers no decision on an application that is already decided", async () => {
    await show(
      fakeApi({ application: vi.fn().mockResolvedValue(application({ pending: false })) }),
    );
    expect(screen.getByText("This application has already been decided.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("says when the application does not exist", async () => {
    await show(fakeApi({ application: vi.fn().mockResolvedValue(null) }));
    expect(screen.getByText("This application was not found.")).toBeTruthy();
  });
});

import "../test-router";
import { addDays, emptyTender, tanzaniaDate, type OpportunityInput } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpportunitiesApi } from "../lib/opportunities";
import { OpportunityFormScreen } from "./opportunity-form";

afterEach(cleanup);

const draft = (over: Partial<OpportunityInput> = {}): OpportunityInput => ({
  type: "job",
  title: "Accountant for a farm cooperative",
  role: "",
  employmentType: "full_time",
  remote: true,
  regionId: "",
  districtId: "",
  sectorId: "s1",
  description: "Keep the books for a farm cooperative of forty members. ".repeat(3),
  closingOn: addDays(tanzaniaDate(), 30),
  skills: ["bookkeeping"],
  noFee: false,
  tender: emptyTender,
  ...over,
});

const options = [{ value: "s1", label: "Agriculture" }];

const fakeApi = (over: Partial<OpportunitiesApi> = {}): OpportunitiesApi => ({
  mine: vi.fn().mockResolvedValue([]),
  load: vi.fn().mockResolvedValue(draft()),
  save: vi.fn().mockResolvedValue({ result: "ok", status: "pending_review" }),
  close: vi.fn().mockResolvedValue("ok"),
  sectors: vi.fn().mockResolvedValue(options),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Mwanza" }]),
  districts: vi.fn().mockResolvedValue([]),
  pickPdf: vi.fn().mockResolvedValue(null),
  uploadTenderDocument: vi.fn().mockResolvedValue("u/doc.pdf"),
  ...over,
});

async function show(api: OpportunitiesApi, id?: string) {
  await act(async () => {
    render(<OpportunityFormScreen api={api} id={id} />);
  });
}

const click = async (role: string, name: string) => {
  await act(async () => fireEvent.click(screen.getByRole(role, { name })));
};

async function nextStep(times = 1) {
  for (let i = 0; i < times; i++)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
}

describe("OpportunityFormScreen (S20)", () => {
  it("opens a draft for editing on step 1 with its fields filled in", async () => {
    const api = fakeApi();
    await show(api, "p1");
    expect(api.load).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Edit your post")).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getByDisplayValue("Accountant for a farm cooperative")).toBeTruthy();
    await nextStep(2);
    expect(screen.getByText("Step 3 of 4")).toBeTruthy();
    expect(screen.getByDisplayValue("bookkeeping")).toBeTruthy();
  });

  it("asks for the role and employment type only for a job", async () => {
    const api = fakeApi();
    await show(api);
    await click("radio", "Job");
    expect(screen.getByLabelText("Role (optional)")).toBeTruthy();
    await click("radio", "Partnership");
    expect(screen.queryByLabelText("Role (optional)")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Full-time" })).toBeNull();
  });

  it("stays on a step until its fields are right", async () => {
    const api = fakeApi();
    await show(api);
    await nextStep();
    expect(screen.getByText("Choose a type.")).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
  });

  it("saves a draft from the first step with only a type and a title", async () => {
    const api = fakeApi({ save: vi.fn().mockResolvedValue({ result: "ok", status: "draft" }) });
    await show(api);
    await click("radio", "Partnership");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Partner for a cold store" },
    });
    await click("button", "Save draft");
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "partnership",
        title: "Partner for a cold store",
        sectorId: "",
      }),
      null,
      false,
    );
    expect(screen.getByText("Saved as a draft.")).toBeTruthy();
  });

  it("asks for the no-fee tick on the last step before sending", async () => {
    const api = fakeApi();
    await show(api, "p1");
    await nextStep(3);
    expect(screen.getByText("Step 4 of 4")).toBeTruthy();
    await click("button", "Send");
    expect(screen.getByText("Tick the no-fee declaration to post.")).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("sends a ticked post, which a new poster's goes to review", async () => {
    const api = fakeApi();
    await show(api, "p1");
    await nextStep(3);
    await click("checkbox", "No fee will be charged to applicants at any stage");
    await click("button", "Send");
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ noFee: true }), "p1", true);
    expect(screen.getByText("Sent. Our team reviews it before members see it.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My posts" }).getAttribute("href")).toBe(
      "/opportunities/mine",
    );
  });

  it("goes back to the step with the problem when Send finds one", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(draft({ noFee: true })) });
    await show(api, "p1");
    await nextStep(3);
    await click("button", "Back");
    fireEvent.change(screen.getByLabelText("Description and requirements"), {
      target: { value: "Too short" },
    });
    await nextStep();
    expect(screen.getByText("Step 3 of 4")).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("says what the server refused, such as a phone number in the text", async () => {
    const api = fakeApi({
      save: vi.fn().mockResolvedValue({ result: "contact_details", status: null }),
    });
    await show(api, "p1");
    await click("button", "Save draft");
    expect(api.save).toHaveBeenCalledWith(expect.anything(), "p1", false);
    expect(
      screen.getByText(
        "Remove phone numbers and email addresses from the post. Members contact you through the platform.",
      ),
    ).toBeTruthy();
  });

  it("starts empty for a new post", async () => {
    const api = fakeApi();
    await show(api);
    expect(screen.getAllByText("Post an opportunity").length).toBeGreaterThan(0);
    expect(api.load).not.toHaveBeenCalled();
    await click("button", "Save draft");
    expect(screen.getByText("Choose a type.")).toBeTruthy();
  });

  const tenderDraft = () =>
    draft({
      type: "tender",
      employmentType: "",
      skills: [],
      tender: {
        ...emptyTender,
        referenceNo: "DCC/PR/2026/114",
        scope: "Supply of 3,000 school uniform sets for twelve primary schools.",
      },
    });

  it("asks for a tender's own fields on the details step and checks them (O04)", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(tenderDraft()) });
    await show(api, "p1");
    await nextStep(2);
    expect(screen.getByDisplayValue("DCC/PR/2026/114")).toBeTruthy();
    expect(screen.getByDisplayValue("17:00")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Closing time"), { target: { value: "5pm" } });
    await nextStep();
    expect(screen.getByText(/Check the tender details/)).toBeTruthy();
    expect(screen.getByText("Step 3 of 4")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Closing time"), { target: { value: "16:00" } });
    fireEvent.change(screen.getByLabelText("Documents a bidder must hold (optional)"), {
      target: { value: "BRELA certificate\nTRA TIN certificate" },
    });
    await nextStep();
    await click("checkbox", "No fee will be charged to applicants at any stage");
    await click("button", "Send");
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tender",
        tender: expect.objectContaining({
          closingTime: "16:00",
          requiredDocuments: "BRELA certificate\nTRA TIN certificate",
        }),
      }),
      "p1",
      true,
    );
  });

  it("uploads the tender document and refuses one over 10 MB (O04)", async () => {
    const pickPdf = vi
      .fn()
      .mockResolvedValueOnce({
        uri: "f",
        name: "big.pdf",
        mime: "application/pdf",
        size: 11 * 1024 * 1024,
      })
      .mockResolvedValue({ uri: "f", name: "t.pdf", mime: "application/pdf", size: 1000 });
    const api = fakeApi({ load: vi.fn().mockResolvedValue(tenderDraft()), pickPdf });
    await show(api, "p1");
    await nextStep(2);
    await click("button", "Add the tender document (PDF)");
    expect(screen.getByText("Choose a PDF of up to 10 MB.")).toBeTruthy();
    expect(api.uploadTenderDocument).not.toHaveBeenCalled();
    await click("button", "Add the tender document (PDF)");
    expect(screen.getByText("Document added.")).toBeTruthy();
    await click("button", "Save draft");
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ tender: expect.objectContaining({ documentPath: "u/doc.pdf" }) }),
      "p1",
      false,
    );
  });
});

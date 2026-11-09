import "../test-router";
import { addDays, tanzaniaDate, type OpportunityInput } from "@kingdom-connect/shared";
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

describe("OpportunityFormScreen (S20)", () => {
  it("opens a draft for editing with its fields filled in", async () => {
    const api = fakeApi();
    await show(api, "p1");
    expect(api.load).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Edit your post")).toBeTruthy();
    expect(screen.getByDisplayValue("Accountant for a farm cooperative")).toBeTruthy();
    expect(screen.getByDisplayValue("bookkeeping")).toBeTruthy();
  });

  it("asks for the no-fee tick before sending", async () => {
    const api = fakeApi();
    await show(api, "p1");
    await click("button", "Send");
    expect(screen.getByText("Tick the no-fee declaration to post.")).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("sends a ticked post, which a new poster's goes to review", async () => {
    const api = fakeApi();
    await show(api, "p1");
    await click("checkbox", "No fee will be charged to applicants at any stage");
    await click("button", "Send");
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ noFee: true }), "p1", true);
    expect(screen.getByText("Sent. Our team reviews it before members see it.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My posts" }).getAttribute("href")).toBe(
      "/opportunities/mine",
    );
  });

  it("says what the server refused, such as a phone number in the text", async () => {
    const api = fakeApi({
      save: vi.fn().mockResolvedValue({ result: "contact_details", status: null }),
    });
    await show(api, "p1");
    await click("checkbox", "No fee will be charged to applicants at any stage");
    await click("button", "Save draft");
    expect(api.save).toHaveBeenCalledWith(expect.anything(), "p1", false);
    expect(
      screen.getByText(
        "Remove phone numbers and email addresses from the post. Members contact you through the platform.",
      ),
    ).toBeTruthy();
  });

  it("starts empty for a new post and checks the type first", async () => {
    const api = fakeApi();
    await show(api);
    expect(screen.getAllByText("Post an opportunity").length).toBeGreaterThan(0);
    expect(api.load).not.toHaveBeenCalled();
    await click("button", "Send");
    expect(screen.getByText("Choose a type.")).toBeTruthy();
  });
});

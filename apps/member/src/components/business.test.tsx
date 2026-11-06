import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessApi, BusinessStatus, PosterStatus } from "../lib/business";
import { BusinessScreen } from "./business";

afterEach(cleanup);

const status = (over: Partial<BusinessStatus> = {}): BusinessStatus => ({
  name: "Asha Traders",
  sectorId: "s1",
  size: "small",
  description: "Sells farm tools",
  brelaNo: "BRELA-1",
  tin: "123-456-789",
  licenceNo: "LIC-1",
  licenceExpiresOn: "2027-06-30",
  level: null,
  businessStatus: "pending",
  requestStatus: "pending",
  reason: null,
  submittedAt: "2026-11-05T09:00:00+03:00",
  ...over,
});

const file = (name: string) => ({ uri: "x", name, mime: "application/pdf", size: 100 });

const fakeApi = (over: Partial<BusinessApi> = {}): BusinessApi => ({
  load: vi.fn().mockResolvedValue(null),
  sectors: vi.fn().mockResolvedValue([{ value: "s1", label: "Agriculture" }]),
  submit: vi.fn().mockResolvedValue("ok"),
  pickFile: vi.fn().mockResolvedValue(file("scan.pdf")),
  loadPoster: vi.fn().mockResolvedValue(null),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Mwanza" }]),
  districts: vi.fn().mockResolvedValue([{ value: "d1", label: "Nyamagana" }]),
  submitPoster: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function show(api: BusinessApi) {
  await act(async () => {
    render(<BusinessScreen api={api} />);
  });
}

async function fillForm() {
  type("Business name", "Asha Traders");
  await click("Sector: Choose");
  await act(async () => fireEvent.click(screen.getByRole("option", { name: "Agriculture" })));
  await click("Size: Choose");
  await act(async () => fireEvent.click(screen.getByRole("option", { name: /Small/ })));
  type("BRELA registration number", "BRELA-1");
  type("TRA TIN", "123 456 789");
  type("Business licence number", "LIC-1");
  type("Licence expires on", "2027-06-30");
  for (const label of ["BRELA certificate", "TRA TIN certificate", "Business licence"])
    await click(`${label}: Choose file`);
}

const poster = (over: Partial<PosterStatus> = {}): PosterStatus => ({
  requestStatus: null,
  reason: null,
  proofKind: "",
  address: "",
  regionId: "",
  districtId: "",
  ...over,
});

const verified = (over: Partial<BusinessApi> = {}) =>
  fakeApi({
    load: vi
      .fn()
      .mockResolvedValue(
        status({ requestStatus: "approved", businessStatus: "approved", level: 2 }),
      ),
    loadPoster: vi.fn().mockResolvedValue(poster()),
    ...over,
  });

async function fillPoster() {
  await click("Proof that you can act for the business: Choose");
  await act(async () =>
    fireEvent.click(
      screen.getByRole("option", { name: "Directors' record from BRELA that lists you" }),
    ),
  );
  await click("Proof document: Choose file");
  type("Business address (street, area or plot)", "Plot 12, Kenyatta Road");
  await click("Region: Choose");
  await act(async () => fireEvent.click(screen.getByRole("option", { name: "Mwanza" })));
  await click("District: Choose");
  await act(async () => fireEvent.click(screen.getByRole("option", { name: "Nyamagana" })));
  await click("Address proof: Choose file");
}

describe("BusinessScreen (S40)", () => {
  it("shows each level's status, with Level 3 locked until the business is verified", async () => {
    await show(fakeApi());
    expect(screen.getByText("Level 1: Verified member")).toBeTruthy();
    expect(screen.getByText("Level 2: Verified Business")).toBeTruthy();
    expect(screen.getAllByText("Not started").length).toBeGreaterThan(0);
    expect(screen.getByText("Available once your business is verified.")).toBeTruthy();
  });

  it("sends the business with three documents", async () => {
    const api = fakeApi();
    await show(api);
    await fillForm();
    await click("Send for review");
    expect(api.submit).toHaveBeenCalledWith(
      {
        name: "Asha Traders",
        sectorId: "s1",
        size: "small",
        description: "",
        brelaNo: "BRELA-1",
        tin: "123 456 789",
        licenceNo: "LIC-1",
        licenceExpiresOn: "2027-06-30",
      },
      { brela: file("scan.pdf"), tin: file("scan.pdf"), licence: file("scan.pdf") },
    );
    expect(screen.getByText("Sent. We will tell you when it is decided.")).toBeTruthy();
  });

  it("asks for every document before sending", async () => {
    const api = fakeApi();
    await show(api);
    type("Business name", "Asha Traders");
    await click("Send for review");
    expect(screen.getByRole("alert").textContent).toBe(
      "Fill in every field and add all three documents.",
    );
    expect(api.submit).not.toHaveBeenCalled();
  });

  it("explains a refusal from the server", async () => {
    await show(fakeApi({ submit: vi.fn().mockResolvedValue("invalid_tin") }));
    await fillForm();
    await click("Send for review");
    expect(screen.getByRole("alert").textContent).toBe(
      "The TIN is 9 digits, for example 123-456-789.",
    );
  });

  it("shows a pending request and no form", async () => {
    await show(fakeApi({ load: vi.fn().mockResolvedValue(status()) }));
    expect(screen.getByText(/We are checking your documents/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull();
  });

  it("shows the reason after a rejection and lets the Member fix and send again", async () => {
    await show(
      fakeApi({
        load: vi.fn().mockResolvedValue(
          status({
            requestStatus: "rejected",
            reason: "The TIN does not match the TRA certificate",
          }),
        ),
      }),
    );
    expect(screen.getByText(/The TIN does not match the TRA certificate/)).toBeTruthy();
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Asha Traders");
    expect(screen.getByRole("button", { name: "Send for review" })).toBeTruthy();
  });

  it("shows an expired business as Expired", async () => {
    await show(
      fakeApi({
        load: vi
          .fn()
          .mockResolvedValue(
            status({ requestStatus: "approved", level: 2, businessStatus: "expired" }),
          ),
      }),
    );
    expect(screen.getByText("Expired")).toBeTruthy();
  });

  it("keeps Level 3 locked and shows no Level 3 form while Level 2 waits", async () => {
    await show(fakeApi({ load: vi.fn().mockResolvedValue(status()) }));
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for Level 3 review" })).toBeNull();
  });

  it("opens Level 3 once the business is verified and sends both documents", async () => {
    const api = verified();
    await show(api);
    await fillPoster();
    await click("Send for Level 3 review");
    expect(api.submitPoster).toHaveBeenCalledWith(
      {
        proofKind: "directorship",
        address: "Plot 12, Kenyatta Road",
        regionId: "r1",
        districtId: "d1",
      },
      { proof: file("scan.pdf"), addressProof: file("scan.pdf") },
    );
    expect(screen.getByText("Sent. We will tell you when Level 3 is decided.")).toBeTruthy();
  });

  it("asks for every Level 3 field before sending", async () => {
    const api = verified();
    await show(api);
    type("Business address (street, area or plot)", "Plot 12");
    await click("Send for Level 3 review");
    expect(screen.getByText("Fill in every field and add both documents.")).toBeTruthy();
    expect(api.submitPoster).not.toHaveBeenCalled();
  });

  it("explains a Level 3 refusal from the server", async () => {
    await show(verified({ submitPoster: vi.fn().mockResolvedValue("contact_details") }));
    await fillPoster();
    await click("Send for Level 3 review");
    expect(
      screen.getByText("The address cannot hold a phone number or an email address."),
    ).toBeTruthy();
  });

  it("shows a pending Level 3 request and no form", async () => {
    await show(
      verified({ loadPoster: vi.fn().mockResolvedValue(poster({ requestStatus: "pending" })) }),
    );
    expect(screen.getByText(/We are checking your Level 3 documents/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for Level 3 review" })).toBeNull();
  });

  it("shows the Level 3 reason and the earlier address after a rejection", async () => {
    await show(
      verified({
        loadPoster: vi.fn().mockResolvedValue(
          poster({
            requestStatus: "rejected",
            reason: "The address proof is older than 3 months",
            proofKind: "directorship",
            address: "Plot 12, Kenyatta Road",
            regionId: "r1",
            districtId: "d1",
          }),
        ),
      }),
    );
    expect(screen.getByText(/The address proof is older than 3 months/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Business address (street, area or plot)") as HTMLInputElement).value,
    ).toBe("Plot 12, Kenyatta Road");
    expect(screen.getByRole("button", { name: "Send for Level 3 review" })).toBeTruthy();
  });

  it("shows an approved Opportunity Poster", async () => {
    await show(
      verified({ loadPoster: vi.fn().mockResolvedValue(poster({ requestStatus: "approved" })) }),
    );
    expect(screen.getByText("Your business is an Opportunity Poster.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for Level 3 review" })).toBeNull();
  });

  it("shows an approved business with the licence date", async () => {
    await show(
      fakeApi({ load: vi.fn().mockResolvedValue(status({ requestStatus: "approved", level: 2 })) }),
    );
    expect(screen.getByText(/Your licence is valid until/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull();
  });
});

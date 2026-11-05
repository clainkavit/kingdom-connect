import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessApi, BusinessStatus } from "../lib/business";
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

  it("shows an approved business with the licence date", async () => {
    await show(
      fakeApi({ load: vi.fn().mockResolvedValue(status({ requestStatus: "approved", level: 2 })) }),
    );
    expect(screen.getByText(/Your licence is valid until/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull();
  });
});

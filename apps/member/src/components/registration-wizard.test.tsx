import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationWizard, type WizardApi } from "./registration-wizard";

afterEach(cleanup);

const fakeApi = (over: Partial<WizardApi> = {}): WizardApi => ({
  saveDraft: vi.fn().mockResolvedValue(undefined),
  saveIdentity: vi.fn().mockResolvedValue({ kind: "saved" }),
  pickAndUploadPhoto: vi.fn().mockResolvedValue("uploaded"),
  submit: vi.fn().mockResolvedValue({ kind: "submitted" }),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Mwanza" }]),
  districts: vi.fn().mockResolvedValue([{ value: "d1", label: "Nyamagana" }]),
  sectors: vi.fn().mockResolvedValue([{ value: "s1", label: "Agriculture" }]),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(step: number, data: object, api: WizardApi, onSubmitted = vi.fn()) {
  await act(async () => {
    render(
      <RegistrationWizard
        initial={{ step, data, submitted: false }}
        api={api}
        onSubmitted={onSubmitted}
      />,
    );
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: /^Continue: /, hidden: true })),
  );
}

describe("Verify your identity (S05, R28)", () => {
  it("opens on the step overview, with Continue on the saved step", async () => {
    await act(async () => {
      render(
        <RegistrationWizard
          initial={{ step: 2, data: {}, submitted: false }}
          api={fakeApi()}
          onSubmitted={vi.fn()}
        />,
      );
    });
    expect(screen.getByText("0 of 5 steps done")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    await click("Continue: What you do");
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
    expect(screen.queryByText("0 of 5 steps done")).toBeNull();
  });

  it("goes back to the overview from the first step without saving", async () => {
    const api = fakeApi();
    await show(1, {}, api);
    await click("Back");
    expect(screen.getByText("0 of 5 steps done")).toBeTruthy();
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it("will not move on until the step is complete, then saves it", async () => {
    const api = fakeApi();
    await show(1, {}, api);
    await click("Save and continue");
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(screen.getAllByText("This is needed.").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Full name, as on your ID"), {
      target: { value: "Test Applicant" },
    });
    await click("Region: Choose");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Mwanza" })));
    await click("District: Choose");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Nyamagana" })));
    fireEvent.change(screen.getByLabelText("Address (street, area or plot)"), {
      target: { value: "Plot 1" },
    });
    await click("Save and continue");
    expect(api.saveDraft).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ fullName: "Test Applicant", regionId: "r1", districtId: "d1" }),
    );
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
  });

  it("asks for the details that fit the chosen category", async () => {
    await show(3, { category: "businessperson" }, fakeApi());
    expect(screen.getByLabelText("Business name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sector: Choose" })).toBeTruthy();
    expect(screen.queryByLabelText("Profession")).toBeNull();
  });

  it("lets the applicant tick several categories, and no longer offers Entrepreneur (R19)", async () => {
    const api = fakeApi();
    await show(2, {}, api);
    expect(screen.queryByRole("checkbox", { name: "Entrepreneur" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Student" })).toBeNull();
    await click("Save and continue");
    expect(screen.getByText("This is needed.")).toBeTruthy();
    expect(api.saveDraft).not.toHaveBeenCalled();

    await act(async () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Businessperson" })),
    );
    await act(async () => fireEvent.click(screen.getByRole("checkbox", { name: "Professional" })));
    expect(
      screen.getByRole("checkbox", { name: "Professional" }).getAttribute("aria-checked"),
    ).toBe("true");
    await click("Save and continue");
    expect(api.saveDraft).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ categories: ["professional", "businessperson"] }),
    );
    expect(screen.getByLabelText("Profession")).toBeTruthy();
    expect(screen.getByLabelText("Business name")).toBeTruthy();
  });

  it("drops the details of a category that is unticked", async () => {
    const api = fakeApi();
    await show(
      2,
      {
        categories: ["professional", "businessperson"],
        categoryDetails: { profession: "Accountant", businessName: "Neema Tailoring" },
      },
      api,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Businessperson" })),
    );
    await click("Save and continue");
    const saved = vi.mocked(api.saveDraft).mock.calls[0]![1];
    expect(saved).toMatchObject({
      categories: ["professional"],
      categoryDetails: { profession: "Accountant" },
    });
    expect(saved.categoryDetails).not.toHaveProperty("businessName");
  });

  it("shows a draft saved with one category as that box ticked", async () => {
    await show(2, { category: "other" }, fakeApi());
    expect(screen.getByRole("checkbox", { name: "Other" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("saves the ID through the server and says when it is already registered", async () => {
    const api = fakeApi({ saveIdentity: vi.fn().mockResolvedValue({ kind: "duplicate" }) });
    await show(4, { idType: "nida" }, api);
    fireEvent.change(screen.getByLabelText("ID number"), {
      target: { value: "19900101123456789012" },
    });
    await click("Save ID");
    expect(api.saveIdentity).toHaveBeenCalledWith({
      idType: "nida",
      idNumber: "19900101123456789012",
    });
    expect(screen.getByRole("alert").textContent).toBe("This ID is already registered.");
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it("says who can open the ID number and the photos", async () => {
    await show(4, {}, fakeApi());
    expect(
      screen.getByText(
        "Stored encrypted. Only administrators can open it, and each time is recorded.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Only administrators see these photos. They are never shown to members."),
    ).toBeTruthy();
  });

  it("says to choose the ID type and number when Save ID is pressed early", async () => {
    const api = fakeApi();
    await show(4, {}, api);
    await click("Save ID");
    expect(api.saveIdentity).not.toHaveBeenCalled();
    expect(screen.getByText("Choose the ID type and enter its number.")).toBeTruthy();
  });

  it("marks a photo as added once it is uploaded", async () => {
    const api = fakeApi();
    await show(4, {}, api);
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Choose photo" })[0]!),
    );
    expect(api.pickAndUploadPhoto).toHaveBeenCalledWith("face");
    expect(api.saveDraft).toHaveBeenCalledWith(4, expect.objectContaining({ facePhoto: true }));
    expect(screen.getByText("Added")).toBeTruthy();
  });

  it.each([
    ["photo_type", "This photo can't be used. Choose a JPEG or PNG photo."],
    ["photo_size", "This photo is too big. Choose one under 5 MB."],
    ["unreadable", "We couldn't open this photo. Try another one, such as a JPEG or PNG."],
    ["network", "We couldn't reach the server. Check your connection and try again."],
  ] as const)("says what went wrong when a photo comes back %s", async (result, message) => {
    const api = fakeApi({ pickAndUploadPhoto: vi.fn().mockResolvedValue(result) });
    await show(4, {}, api);
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Choose photo" })[0]!),
    );
    expect(screen.getByText(message)).toBeTruthy();
    expect(api.saveDraft).not.toHaveBeenCalledWith(4, expect.objectContaining({ facePhoto: true }));
    expect(screen.queryByText("Added")).toBeNull();
  });

  it("says nothing when the person closes the photo picker", async () => {
    const api = fakeApi({ pickAndUploadPhoto: vi.fn().mockResolvedValue("cancelled") });
    await show(4, {}, api);
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Choose photo" })[0]!),
    );
    expect(screen.queryByText(/couldn't|too big|can't be used/)).toBeNull();
    expect(screen.queryByText("Added")).toBeNull();
  });

  it("goes back to an unfinished step when the server says so", async () => {
    const onSubmitted = vi.fn();
    const api = fakeApi({ submit: vi.fn().mockResolvedValue({ kind: "incomplete", step: 4 }) });
    await show(6, {}, api, onSubmitted);
    await click("Send to staff");
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByText("Step 4 of 5")).toBeTruthy();
  });

  it("has no terms step: after ID and photos comes Check and send, step 5 of 5", async () => {
    const api = fakeApi();
    await show(6, {}, api);
    expect(screen.getByText("Step 5 of 5")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "I accept the terms of use" })).toBeNull();
    await click("Back");
    expect(api.saveDraft).toHaveBeenCalledWith(4, expect.anything());
  });

  it("opens a draft saved on the old terms step at Check and send", async () => {
    await show(5, {}, fakeApi());
    expect(screen.getByText("Step 5 of 5")).toBeTruthy();
  });

  it("finishes when the application is submitted", async () => {
    const onSubmitted = vi.fn();
    await show(6, {}, fakeApi(), onSubmitted);
    await click("Send to staff");
    expect(onSubmitted).toHaveBeenCalled();
  });
});

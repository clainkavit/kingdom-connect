import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsApi } from "@/lib/settings";
import { SettingsScreen } from "./settings-screen";

afterEach(cleanup);

const fakeApi = (over: Partial<SettingsApi> = {}): SettingsApi => ({
  cap: vi.fn().mockResolvedValue(null),
  saveCap: vi.fn().mockResolvedValue(true),
  staff: vi.fn().mockResolvedValue([
    { id: "s1", fullName: "Test Super Administrator", role: "super_admin", active: true },
    { id: "s2", fullName: "Test Administrator", role: "admin", active: true },
  ]),
  invite: vi.fn().mockResolvedValue("done"),
  setActive: vi.fn().mockResolvedValue("done"),
  synonyms: vi.fn().mockResolvedValue([{ id: "y1", fromName: "js", skillName: "javascript" }]),
  addSynonym: vi.fn().mockResolvedValue("done"),
  removeSynonym: vi.fn().mockResolvedValue(true),
  ...over,
});

async function show(api: SettingsApi, superAdmin = true) {
  await act(async () => {
    render(<SettingsScreen api={api} superAdmin={superAdmin} />);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("SettingsScreen (A16)", () => {
  it("shows an Administrator the skill synonyms, and keeps the cap and staff for Super Administrators", async () => {
    const api = fakeApi();
    await show(api, false);
    expect(screen.getByText("Only Super Administrators can change these settings.")).toBeTruthy();
    expect(api.cap).not.toHaveBeenCalled();
    expect(api.staff).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Skill synonyms" })).toBeTruthy();
    expect(screen.getByText("js → javascript")).toBeTruthy();
  });

  it("adds and removes a skill synonym", async () => {
    const api = fakeApi();
    await show(api, false);
    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: "JS " } });
    fireEvent.change(screen.getByLabelText("Skill it means"), { target: { value: "JavaScript" } });
    await click("Add synonym");
    expect(api.addSynonym).toHaveBeenCalledWith("JS ", "JavaScript");
    expect(screen.getByText("Synonym added.")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove js" })));
    expect(api.removeSynonym).toHaveBeenCalledWith("y1");
  });

  it("says when a synonym already exists", async () => {
    await show(fakeApi({ addSynonym: vi.fn().mockResolvedValue("exists") }), false);
    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: "js" } });
    fireEvent.change(screen.getByLabelText("Skill it means"), { target: { value: "x" } });
    await click("Add synonym");
    expect(screen.getByText("That variant already has a synonym.")).toBeTruthy();
  });

  it("shows the cap off by default and saves a limit", async () => {
    const api = fakeApi();
    await show(api);
    const toggle = screen.getByRole("checkbox", { name: "Limit sign-ups each day" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await act(async () => fireEvent.click(toggle));
    fireEvent.change(screen.getByLabelText("Sign-ups a day"), { target: { value: "40" } });
    await click("Save");
    expect(api.saveCap).toHaveBeenCalledWith(40);
    expect(screen.getByText("Saved.")).toBeTruthy();
  });

  it("refuses a limit that is not a whole number", async () => {
    const api = fakeApi({ cap: vi.fn().mockResolvedValue(10) });
    await show(api);
    fireEvent.change(screen.getByLabelText("Sign-ups a day"), { target: { value: "0" } });
    await click("Save");
    expect(api.saveCap).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a whole number from 1 to 999999.")).toBeTruthy();
  });

  it("turns the cap off", async () => {
    const api = fakeApi({ cap: vi.fn().mockResolvedValue(10) });
    await show(api);
    await act(async () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Limit sign-ups each day" })),
    );
    await click("Save");
    expect(api.saveCap).toHaveBeenCalledWith(null);
  });

  it("invites a staff member", async () => {
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Admin" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.test" } });
    await click("Send invite");
    expect(api.invite).toHaveBeenCalledWith({
      fullName: "New Admin",
      email: "new@example.test",
      role: "admin",
    });
    expect(
      screen.getByText("Invite sent to new@example.test. The link works for 24 hours."),
    ).toBeTruthy();
  });

  it("says when the email already has an account", async () => {
    await show(fakeApi({ invite: vi.fn().mockResolvedValue("email_taken") }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "x@example.test" } });
    await click("Send invite");
    expect(screen.getByText("That email already has an account.")).toBeTruthy();
  });

  it("deactivates a staff account, and says when it is not allowed", async () => {
    const api = fakeApi({
      setActive: vi.fn().mockResolvedValueOnce("done").mockResolvedValueOnce("refused"),
    });
    await show(api);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Deactivate Test Administrator" })),
    );
    expect(api.setActive).toHaveBeenCalledWith("s2", false);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Deactivate Test Super Administrator" })),
    );
    expect(screen.getByText(/You cannot deactivate yourself/)).toBeTruthy();
  });
});

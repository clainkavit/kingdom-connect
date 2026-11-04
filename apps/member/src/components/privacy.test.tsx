import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsApi } from "../lib/connections";
import type { PrivacyApi, PrivacySettings } from "../lib/privacy";
import { PrivacyScreen, SettingsMenu } from "./privacy";

afterEach(cleanup);

const settings = (over: Partial<PrivacySettings> = {}): PrivacySettings => ({
  hidden: false,
  sharePhone: false,
  shareEmail: false,
  shareAddress: false,
  phone: "+255700000001",
  email: "member@test.invalid",
  address: "",
  ...over,
});

const fakeApi = (over: Partial<PrivacyApi> = {}): PrivacyApi => ({
  load: vi.fn().mockResolvedValue(settings()),
  set: vi.fn().mockResolvedValue(true),
  ...over,
});

const contact = {
  setPhone: vi.fn(),
  setAddress: vi.fn(),
  startEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
};

const connections = {
  blocked: vi.fn().mockResolvedValue([]),
  unblock: vi.fn().mockResolvedValue(true),
} as unknown as ConnectionsApi;

async function show(api: PrivacyApi) {
  await act(async () => {
    render(<PrivacyScreen api={api} connections={connections} contact={contact} />);
  });
}

const toggle = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("switch", { name })));

describe("SettingsMenu (S44)", () => {
  it("links to privacy and contact sharing", () => {
    render(<SettingsMenu />);
    expect(
      screen
        .getByRole("link", { name: "Profile privacy and contact sharing" })
        .getAttribute("href"),
    ).toBe("/settings/privacy");
  });
});

describe("PrivacyScreen (S45)", () => {
  it("shows every switch off by default, with the value each one would share", async () => {
    await show(fakeApi());
    for (const name of [
      "Hide my profile from the directory",
      "Share my phone number",
      "Share my email",
      "Share my address",
    ])
      expect(screen.getByRole("switch", { name }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByText("+255700000001")).toHaveLength(2);
    expect(screen.getAllByText("member@test.invalid")).toHaveLength(2);
    expect(screen.getAllByText("Not given")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Change phone number" })).toBeTruthy();
  });

  it("saves a switch as soon as it is turned", async () => {
    const api = fakeApi();
    await show(api);
    await toggle("Share my phone number");
    expect(api.set).toHaveBeenCalledWith("sharePhone", true);
    expect(
      screen.getByRole("switch", { name: "Share my phone number" }).getAttribute("aria-checked"),
    ).toBe("true");
    await toggle("Hide my profile from the directory");
    expect(api.set).toHaveBeenCalledWith("hidden", true);
  });

  it("turns the switch back and says so when saving fails", async () => {
    await show(fakeApi({ set: vi.fn().mockResolvedValue(false) }));
    await toggle("Share my email");
    expect(
      screen.getByRole("switch", { name: "Share my email" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't save that change/);
  });

  it("offers Try again when the settings cannot load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(settings());
    await show(fakeApi({ load }));
    expect(screen.getByText(/couldn't load your privacy settings/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByRole("switch", { name: "Share my email" })).toBeTruthy();
  });
});

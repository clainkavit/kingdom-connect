import "../test-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOW_DATA_KEY, LowDataProvider } from "../lib/low-data";
import { SettingsMenu } from "./privacy";
import { Avatar } from "./profile";

afterEach(async () => {
  cleanup();
  await AsyncStorage.clear();
});

describe("Low-data mode (PRD section 15, audit M6)", () => {
  it("shows a profile photo normally and initials once low-data mode is on", async () => {
    render(
      <LowDataProvider>
        <SettingsMenu />
        <Avatar name="Asha Test" url="https://example.test/photo.jpg" />
      </LowDataProvider>,
    );
    await act(async () => undefined);
    expect(screen.getByRole("img", { name: "Asha Test" })).toBeTruthy();

    const toggle = screen.getByRole("switch", { name: "Low-data mode" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => fireEvent.click(toggle));

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("img", { name: "Asha Test" })).toBeNull();
    expect(screen.getByText("AT")).toBeTruthy();
    expect(await AsyncStorage.getItem(LOW_DATA_KEY)).toBe("1");
  });

  it("remembers the choice on this device", async () => {
    await AsyncStorage.setItem(LOW_DATA_KEY, "1");
    render(
      <LowDataProvider>
        <Avatar name="Asha Test" url="https://example.test/photo.jpg" />
      </LowDataProvider>,
    );
    await act(async () => undefined);
    expect(screen.queryByRole("img", { name: "Asha Test" })).toBeNull();
  });
});

import { router } from "../test-router";
import { memberNav, memberPhoneTabs } from "@kingdom-connect/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as RN from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemberShell } from "./shell";

const width = (w: number) =>
  vi
    .spyOn(RN, "useWindowDimensions")
    .mockReturnValue({ width: w, height: 800, scale: 1, fontScale: 1 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  router.pathname = "/";
});

describe("MemberShell on a wide screen", () => {
  it("shows every member menu item in the top bar", () => {
    width(1280);
    render(<MemberShell>content</MemberShell>);
    const menu = within(screen.getByLabelText("Member menu"));
    for (const item of memberNav) {
      expect(menu.getByText(item.label).closest("a")?.getAttribute("href")).toBe(item.href);
    }
    expect(screen.getByText("Kingdom Connect")).toBeTruthy();
    expect(screen.queryByLabelText("Member tabs")).toBeNull();
  });

  it("marks the current screen", () => {
    width(1280);
    router.pathname = "/messages";
    render(<MemberShell>content</MemberShell>);
    const menu = within(screen.getByLabelText("Member menu"));
    expect(menu.getByText("Messages").closest("a")?.getAttribute("aria-current")).toBe("page");
    expect(menu.getByText("Events").closest("a")?.getAttribute("aria-current")).toBeNull();
  });

  it("logs out from the top bar", () => {
    width(1280);
    const onSignOut = vi.fn();
    render(<MemberShell onSignOut={onSignOut}>content</MemberShell>);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe("MemberShell on a phone", () => {
  it("shows the five tabs as named icons instead of the top bar menu", () => {
    width(390);
    render(<MemberShell>content</MemberShell>);
    const tabs = within(screen.getByLabelText("Member tabs"));
    expect(memberPhoneTabs.map((t) => tabs.getByLabelText(t.label).getAttribute("href"))).toEqual(
      memberPhoneTabs.map((t) => t.href),
    );
    for (const t of memberPhoneTabs) expect(tabs.queryByText(t.label)).toBeNull();
    expect(screen.queryByLabelText("Member menu")).toBeNull();
  });

  it("marks the current tab", () => {
    width(390);
    router.pathname = "/people";
    render(<MemberShell>content</MemberShell>);
    const tabs = within(screen.getByLabelText("Member tabs"));
    expect(tabs.getByLabelText("People").getAttribute("aria-current")).toBe("page");
    expect(tabs.getByLabelText("Home").getAttribute("aria-current")).toBeNull();
  });
});

it("renders the screen content", () => {
  width(390);
  render(<MemberShell>screen content</MemberShell>);
  expect(screen.getByText("screen content")).toBeTruthy();
});

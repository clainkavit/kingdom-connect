import { router } from "../test-router";
import { memberNav, memberPhoneTabs } from "@kingdom-connect/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("shows every member sidebar item and the Report card", () => {
    width(1280);
    render(<MemberShell>content</MemberShell>);
    const sidebar = within(screen.getByLabelText("Member menu"));
    for (const item of memberNav) {
      expect(sidebar.getByText(item.label).closest("a")?.getAttribute("href")).toBe(item.href);
    }
    expect(screen.getByText("Report a Scam / Bad User")).toBeTruthy();
    for (const sub of ["Jobs", "Partnerships", "Investment", "Tenders"]) {
      expect(sidebar.getByText(sub).closest("a")?.getAttribute("href")).toMatch(
        /^\/opportunities\?type=/,
      );
    }
    expect(screen.queryByLabelText("Member tabs")).toBeNull();
  });

  it("marks the current screen", () => {
    width(1280);
    router.pathname = "/messages";
    render(<MemberShell>content</MemberShell>);
    const sidebar = within(screen.getByLabelText("Member menu"));
    expect(sidebar.getByText("Messages").closest("a")?.getAttribute("aria-current")).toBe("page");
    expect(sidebar.getByText("Events").closest("a")?.getAttribute("aria-current")).toBeNull();
  });
});

describe("MemberShell on a phone", () => {
  it("highlights People on the Businesses screen", () => {
    width(390);
    router.pathname = "/businesses";
    render(<MemberShell>content</MemberShell>);
    const tabs = within(screen.getByLabelText("Member tabs"));
    expect(tabs.getByText("People").closest("a")?.getAttribute("aria-current")).toBe("page");
  });

  it("shows the five tabs instead of the sidebar", () => {
    width(390);
    render(<MemberShell>content</MemberShell>);
    const tabs = within(screen.getByLabelText("Member tabs"));
    expect(
      memberPhoneTabs.map((t) => tabs.getByText(t.label).closest("a")?.getAttribute("href")),
    ).toEqual(memberPhoneTabs.map((t) => t.href));
    expect(screen.queryByLabelText("Member menu")).toBeNull();
  });
});

it("renders the screen content", () => {
  width(390);
  render(<MemberShell>screen content</MemberShell>);
  expect(screen.getByText("screen content")).toBeTruthy();
});

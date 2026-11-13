import { router } from "../test-router";
import { memberNav, memberPhoneTabs, stringsFor, type Language } from "@kingdom-connect/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as RN from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageContext } from "../lib/language";
import { MemberShell } from "./shell";

const en = stringsFor("en");
const sw = stringsFor("sw");

function inLanguage(language: Language, ui: React.ReactNode, setLanguage = vi.fn()) {
  return render(
    <LanguageContext.Provider
      value={{ language, t: stringsFor(language), platformName: "Test Platform", setLanguage }}
    >
      {ui}
    </LanguageContext.Provider>,
  );
}

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
    inLanguage("en", <MemberShell>content</MemberShell>);
    const menu = within(screen.getByLabelText("Member menu"));
    for (const item of memberNav) {
      expect(menu.getByText(en[item.key]).closest("a")?.getAttribute("href")).toBe(item.href);
    }
    expect(screen.getByText("Test Platform")).toBeTruthy();
    expect(screen.queryByLabelText("Member tabs")).toBeNull();
  });

  it("marks the current screen", () => {
    width(1280);
    router.pathname = "/messages";
    render(<MemberShell>content</MemberShell>);
    const menu = within(screen.getByLabelText("Member menu"));
    expect(menu.getByText("Messages").closest("a")?.getAttribute("aria-current")).toBe("page");
    expect(menu.getByText("Growth").closest("a")?.getAttribute("aria-current")).toBeNull();
  });

  it("opens the account page from the person icon, with Log out there instead of the bar", () => {
    width(1280);
    render(<MemberShell>content</MemberShell>);
    expect(screen.getByRole("link", { name: "My account" }).getAttribute("href")).toBe("/account");
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  });
});

describe("MemberShell top bar search (R22)", () => {
  it("opens the Search page with the typed words", () => {
    width(1280);
    router.pushed.length = 0;
    inLanguage("en", <MemberShell>content</MemberShell>);
    const box = screen.getByLabelText("Search Test Platform");
    fireEvent.change(box, { target: { value: " book keeper " } });
    fireEvent.keyDown(box, { key: "Enter", code: "Enter", keyCode: 13 });
    expect(router.pushed).toEqual(["/search?q=book%20keeper"]);
  });

  it("is not on the phone, which keeps its tabs", () => {
    width(390);
    inLanguage("en", <MemberShell>content</MemberShell>);
    expect(screen.queryByLabelText("Search Test Platform")).toBeNull();
  });
});

describe("Unread messages on Messages (R24)", () => {
  it("shows the count on the top bar and says it to screen readers", () => {
    width(1280);
    inLanguage("en", <MemberShell unreadMessages={3}>content</MemberShell>);
    const link = screen.getByRole("link", { name: "Messages, 3 unread" });
    expect(link.textContent).toContain("3");
  });

  it("shows 9+ for ten or more, on the phone tab too", () => {
    width(390);
    inLanguage("en", <MemberShell unreadMessages={12}>content</MemberShell>);
    expect(screen.getByRole("link", { name: "Messages, 12 unread" }).textContent).toContain("9+");
  });

  it("shows no count when everything is read", () => {
    width(1280);
    inLanguage("en", <MemberShell unreadMessages={0}>content</MemberShell>);
    expect(screen.getByRole("link", { name: "Messages" }).textContent).toBe("Messages");
  });
});

describe("MemberShell on a phone", () => {
  it("shows the five tabs with a word under each icon instead of the top bar menu", () => {
    width(390);
    render(<MemberShell>content</MemberShell>);
    const tabs = within(screen.getByLabelText("Member tabs"));
    expect(memberPhoneTabs.map((t) => tabs.getByLabelText(en[t.key]).getAttribute("href"))).toEqual(
      memberPhoneTabs.map((t) => t.href),
    );
    for (const t of memberPhoneTabs) expect(tabs.getByText(en[t.key])).toBeTruthy();
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

describe("MemberShell in Kiswahili (F07)", () => {
  it("shows every menu item, tab name and button in Kiswahili", () => {
    width(1280);
    inLanguage("sw", <MemberShell>content</MemberShell>);
    const menu = within(screen.getByLabelText(sw.memberMenu));
    for (const item of memberNav) {
      expect(menu.getByText(sw[item.key])).toBeTruthy();
      if (sw[item.key] !== en[item.key]) expect(menu.queryByText(en[item.key])).toBeNull();
    }
    expect(screen.getByRole("link", { name: sw.myAccount })).toBeTruthy();
  });

  it("names the phone tabs in Kiswahili", () => {
    width(390);
    inLanguage("sw", <MemberShell>content</MemberShell>);
    const tabs = within(screen.getByLabelText(sw.memberTabs));
    for (const tab of memberPhoneTabs) expect(tabs.getByLabelText(sw[tab.key])).toBeTruthy();
  });

  it("switches language from the top bar", () => {
    width(1280);
    const setLanguage = vi.fn();
    inLanguage("en", <MemberShell>content</MemberShell>, setLanguage);
    expect(screen.queryByRole("menuitem", { name: "Kiswahili" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change language" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Kiswahili" }));
    expect(setLanguage).toHaveBeenCalledWith("sw");
    expect(screen.queryByRole("menuitem", { name: "Kiswahili" })).toBeNull();
  });
});

it("renders the screen content", () => {
  width(390);
  render(<MemberShell>screen content</MemberShell>);
  expect(screen.getByText("screen content")).toBeTruthy();
});

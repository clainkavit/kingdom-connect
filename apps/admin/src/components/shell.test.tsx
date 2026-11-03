import { adminNav, adminPhoneTabs, stringsFor } from "@kingdom-connect/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageContext } from "@/lib/language";
import { AdminShell } from "./shell";

const en = stringsFor("en");
const sw = stringsFor("sw");

vi.mock("next/navigation", () => ({ usePathname: () => "/verification" }));

afterEach(cleanup);

describe("AdminShell", () => {
  it("hides the audit log from an Administrator", () => {
    render(<AdminShell>content</AdminShell>);
    const sidebar = within(screen.getByRole("navigation", { name: "Admin menu" }));
    expect(sidebar.queryByRole("link", { name: "Audit log" })).toBeNull();
  });

  it("shows every admin sidebar item to a Super Admin", () => {
    render(<AdminShell superAdmin>content</AdminShell>);
    const sidebar = within(screen.getByRole("navigation", { name: "Admin menu" }));
    for (const item of adminNav) {
      expect(sidebar.getByRole("link", { name: en[item.key] }).getAttribute("href")).toBe(
        item.href,
      );
    }
  });

  it("shows the five phone tabs", () => {
    render(<AdminShell>content</AdminShell>);
    const tabs = within(screen.getByRole("navigation", { name: "Admin tabs" }));
    expect(tabs.getAllByRole("link").map((l) => l.textContent)).toEqual(
      adminPhoneTabs.map((t) => en[t.key]),
    );
  });

  it("marks the current screen", () => {
    render(<AdminShell>content</AdminShell>);
    const sidebar = within(screen.getByRole("navigation", { name: "Admin menu" }));
    expect(
      sidebar.getByRole("link", { name: "Verification queue" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(sidebar.getByRole("link", { name: "Reports" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows the menu, tabs and staff note in Kiswahili (F07)", () => {
    render(
      <LanguageContext.Provider
        value={{ language: "sw", t: sw, platformName: "Test Platform", setLanguage: vi.fn() }}
      >
        <AdminShell onSignOut={vi.fn()} superAdmin>
          content
        </AdminShell>
      </LanguageContext.Provider>,
    );
    const sidebar = within(screen.getByRole("navigation", { name: sw.adminMenu }));
    for (const item of adminNav)
      expect(sidebar.getByRole("link", { name: sw[item.key] })).toBeTruthy();
    const tabs = within(screen.getByRole("navigation", { name: sw.adminTabs }));
    expect(tabs.getAllByRole("link").map((l) => l.textContent)).toEqual(
      adminPhoneTabs.map((t) => sw[t.key]),
    );
    expect(screen.getByText(sw.staffNote)).toBeTruthy();
    expect(screen.getByRole("button", { name: sw.logOut })).toBeTruthy();
    expect(screen.getAllByText("Test Platform").length).toBeGreaterThan(0);
  });

  it("switches language from the sidebar", () => {
    const setLanguage = vi.fn();
    render(
      <LanguageContext.Provider
        value={{ language: "en", t: en, platformName: "Test Platform", setLanguage }}
      >
        <AdminShell>content</AdminShell>
      </LanguageContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kiswahili" }));
    expect(setLanguage).toHaveBeenCalledWith("sw");
  });

  it("renders the screen content", () => {
    render(<AdminShell>screen content</AdminShell>);
    expect(screen.getByRole("main").textContent).toBe("screen content");
  });
});

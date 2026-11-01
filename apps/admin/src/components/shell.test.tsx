import { adminNav, adminPhoneTabs } from "@kingdom-connect/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/verification" }));

afterEach(cleanup);

describe("AdminShell", () => {
  it("shows every admin sidebar item", () => {
    render(<AdminShell>content</AdminShell>);
    const sidebar = within(screen.getByRole("navigation", { name: "Admin menu" }));
    for (const item of adminNav) {
      expect(sidebar.getByRole("link", { name: item.label }).getAttribute("href")).toBe(item.href);
    }
  });

  it("shows the five phone tabs", () => {
    render(<AdminShell>content</AdminShell>);
    const tabs = within(screen.getByRole("navigation", { name: "Admin tabs" }));
    expect(tabs.getAllByRole("link").map((l) => l.textContent)).toEqual(
      adminPhoneTabs.map((t) => t.label),
    );
  });

  it("marks the current screen", () => {
    render(<AdminShell>content</AdminShell>);
    const sidebar = within(screen.getByRole("navigation", { name: "Admin menu" }));
    expect(
      sidebar.getByRole("link", { name: "Verification Queue" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(sidebar.getByRole("link", { name: "Reports" }).getAttribute("aria-current")).toBeNull();
  });

  it("renders the screen content", () => {
    render(<AdminShell>screen content</AdminShell>);
    expect(screen.getByRole("main").textContent).toBe("screen content");
  });
});

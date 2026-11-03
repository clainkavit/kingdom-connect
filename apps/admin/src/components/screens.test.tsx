import { adminNav, adminPhoneTabs, stringsFor } from "@kingdom-connect/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ComingSoon, MoreList } from "./screens";

const en = stringsFor("en");

afterEach(cleanup);

describe("ComingSoon", () => {
  it("names the screen and says it is not built yet", () => {
    render(<ComingSoon titleKey="adminNavAudit" />);
    expect(screen.getByRole("heading", { level: 1, name: "Audit log" })).toBeTruthy();
    expect(screen.getByText("This screen is not built yet.")).toBeTruthy();
  });
});

describe("MoreList", () => {
  it("lists every menu item that has no phone tab", () => {
    render(<MoreList superAdmin />);
    const tabHrefs = new Set(adminPhoneTabs.map((t) => t.href));
    const expected = adminNav.filter((i) => !tabHrefs.has(i.href)).map((i) => en[i.key]);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"))).toEqual(expected);
  });

  it("leaves out the audit log for an Administrator", () => {
    render(<MoreList />);
    expect(screen.queryByRole("link", { name: "Audit log" })).toBeNull();
  });
});

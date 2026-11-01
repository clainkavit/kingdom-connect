import { adminNav, adminPhoneTabs } from "@kingdom-connect/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ComingSoon, MoreList } from "./screens";

afterEach(cleanup);

describe("ComingSoon", () => {
  it("names the screen and says it is not built yet", () => {
    render(<ComingSoon title="Audit Log" />);
    expect(screen.getByRole("heading", { level: 1, name: "Audit Log" })).toBeTruthy();
    expect(screen.getByText("This screen is not built yet.")).toBeTruthy();
  });
});

describe("MoreList", () => {
  it("lists every sidebar item that has no phone tab", () => {
    render(<MoreList />);
    const tabHrefs = new Set(adminPhoneTabs.map((t) => t.href));
    const expected = adminNav.filter((i) => !tabHrefs.has(i.href)).map((i) => i.label);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(expected);
  });
});

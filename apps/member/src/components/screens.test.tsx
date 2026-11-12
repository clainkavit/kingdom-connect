import "../test-router";
import { accountItems, growthSections, stringsFor } from "@kingdom-connect/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountList, ComingSoon, GrowthList } from "./screens";

const en = stringsFor("en");

afterEach(cleanup);

describe("ComingSoon", () => {
  it("names the screen and says it is not built yet", () => {
    render(<ComingSoon title="Ideas" />);
    expect(screen.getByRole("heading", { name: "Ideas" })).toBeTruthy();
    expect(screen.getByText("This screen is not built yet.")).toBeTruthy();
  });
});

describe("GrowthList", () => {
  it("lists Ideas, Training, Events and Milestone plans with what each is for", () => {
    render(<GrowthList />);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(
      growthSections.map((g) => g.href),
    );
    expect(screen.getByText("Share an idea, or find one to invest in or join.")).toBeTruthy();
  });
});

describe("AccountList", () => {
  it("lists My profile, News, Reports & Safety and Settings", () => {
    render(<AccountList />);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"))).toEqual(
      accountItems.map((i) => en[i.key]),
    );
  });
});

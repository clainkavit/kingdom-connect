import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { COMPUTER, PHONE, setWidth } from "../test-width";
import { AuthCard } from "./auth-card";

afterEach(() => {
  cleanup();
  setWidth(COMPUTER);
  router.pushed.length = 0;
});

describe("AuthCard (Web-Login and Phone-Login designs, audit L2)", () => {
  it.each([
    ["computer", COMPUTER],
    ["phone", PHONE],
  ])("frames the form with the logo, language switch and legal links on a %s", async (_, w) => {
    setWidth(w);
    render(
      <AuthCard title="Log in to Kingdom Connect">
        <></>
      </AuthCard>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Log in to Kingdom Connect" }),
    ).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kiswahili" })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Privacy notice" })));
    expect(router.pushed).toEqual(["/legal/privacy"]);
  });

  it("shows the photo card on a computer only", () => {
    setWidth(COMPUTER);
    render(<AuthCard title="Log in">{null}</AuthCard>);
    expect(screen.getByText("Every member verified")).toBeTruthy();
    cleanup();
    setWidth(PHONE);
    render(<AuthCard title="Log in">{null}</AuthCard>);
    expect(screen.queryByText("Every member verified")).toBeNull();
  });
});

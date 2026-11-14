import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPUTER, PHONE, setWidth } from "../test-width";
import { LandingScreen } from "./landing";

afterEach(() => {
  cleanup();
  setWidth(COMPUTER);
});

const renderLanding = () => {
  const handlers = { onSignUp: vi.fn(), onLogIn: vi.fn(), onLegal: vi.fn() };
  render(<LandingScreen play {...handlers} />);
  return handlers;
};

describe("LandingScreen (S01)", () => {
  it.each([
    ["computer", COMPUTER],
    ["phone", PHONE],
  ])("says what the platform is and offers sign up and log in, on a %s", async (_, width) => {
    setWidth(width);
    const { onSignUp, onLogIn } = renderLanding();
    expect(
      screen.getByRole("heading", {
        name: "Find people, opportunities and ideas to grow together",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("A members-only platform for Tanzania. Every member is verified."),
    ).toBeTruthy();
    expect(screen.getByText("Every member verified")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Create an account" })),
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Log in" })));
    expect(onSignUp).toHaveBeenCalled();
    expect(onLogIn).toHaveBeenCalled();
  });

  it("opens the terms of use and the privacy notice", async () => {
    const { onLegal } = renderLanding();
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Terms of use" })));
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Privacy notice" })));
    expect(onLegal.mock.calls).toEqual([["terms"], ["privacy"]]);
  });

  it("shows the language as an EN and SW pill, with the current one pressed", () => {
    renderLanding();
    const group = screen.getByRole("group", { name: "Language" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Kiswahili" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});

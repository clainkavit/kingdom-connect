import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleChoice } from "./role-choice";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RoleChoice (owner request, walkthrough M1)", () => {
  it("offers member and staff, with member chosen", () => {
    render(<RoleChoice base="https://admin.example.test" />);
    expect(screen.getByRole("group", { name: "Who is signing in?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "I'm a member" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "I'm staff" })).toBeTruthy();
  });

  it("sends staff to the admin console's log-in", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign });
    render(<RoleChoice base="https://admin.example.test/" />);
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "I'm staff" })));
    expect(assign).toHaveBeenCalledWith("https://admin.example.test/login");
  });

  it("shows nothing when this environment has no admin console address", () => {
    render(<RoleChoice base="" />);
    expect(screen.queryByRole("group")).toBeNull();
  });
});

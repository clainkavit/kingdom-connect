import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemberAppLink } from "./member-app-link";

afterEach(cleanup);

describe("MemberAppLink (owner request, walkthrough M1)", () => {
  it("links a member who opened the admin console to the member app's log-in", () => {
    render(<MemberAppLink base="https://member.example.test/" />);
    expect(screen.getByText("Not staff?")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the member app" }).getAttribute("href")).toBe(
      "https://member.example.test/login",
    );
  });

  it("shows nothing when no member app address is set", () => {
    render(<MemberAppLink base="" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Landing } from "./landing";
import { LegalPage } from "./legal-page";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const text = (over: Record<string, unknown> = {}) => ({
  version: "0.2",
  body_en:
    "# Terms of use\n\nThese terms bind {platform_name}.\n\n## Who can join\n\n- People in Tanzania",
  body_sw: "# Masharti\n\nMasharti haya ni ya {platform_name}.",
  approved_at: null,
  effective_at: "2026-11-06T00:00:00Z",
  ...over,
});

describe("Landing (S00)", () => {
  it("offers Create an account and Log in, and links the public texts", async () => {
    await show(<Landing />);
    expect(screen.getByRole("heading", { name: /^Find people/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(
      "/sign-up",
    );
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Terms of use" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy notice" }).getAttribute("href")).toBe(
      "/privacy",
    );
  });
});

describe("LegalPage (Web-Terms, Web-Privacy)", () => {
  it("shows the text in effect, marked as a draft until it is approved", async () => {
    const read = vi.fn().mockResolvedValue({ text: text(), entityName: "" });
    await show(<LegalPage kind="terms" read={read} />);
    expect(read).toHaveBeenCalledWith("terms");
    expect(screen.getByRole("heading", { name: "Terms of use", level: 1 })).toBeTruthy();
    expect(screen.getByText(/^Draft · version 0\.2 · /)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Who can join" })).toBeTruthy();
    expect(screen.queryByText(/\{platform_name\}/)).toBeNull();
  });

  it("drops the draft mark once a version 1 text is approved", async () => {
    const read = vi.fn().mockResolvedValue({
      text: text({ version: "1.0", approved_at: "2026-12-01T00:00:00Z" }),
      entityName: "Kingdom Connect Ltd",
    });
    await show(<LegalPage kind="privacy" read={read} />);
    expect(screen.getByText(/^Version 1\.0 · /)).toBeTruthy();
    expect(screen.queryByText(/^Draft/)).toBeNull();
  });

  it("switches to the Kiswahili text", async () => {
    const read = vi.fn().mockResolvedValue({ text: text(), entityName: "" });
    await show(<LegalPage kind="terms" read={read} />);
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Kiswahili" })));
    expect(screen.getByText(/^Masharti haya ni ya/)).toBeTruthy();
  });

  it("says when the text cannot load", async () => {
    const read = vi.fn().mockRejectedValue(new Error("offline"));
    await show(<LegalPage kind="terms" read={read} />);
    expect(screen.getByText(/couldn't load this text/)).toBeTruthy();
  });
});

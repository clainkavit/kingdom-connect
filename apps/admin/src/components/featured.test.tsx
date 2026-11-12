import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeaturedApi, FeaturedRow } from "@/lib/featured";
import { FeaturedManager } from "./featured";

afterEach(cleanup);

const post = (over: Partial<FeaturedRow> = {}): FeaturedRow => ({
  id: "o1",
  title: "Supply of school uniforms",
  type: "tender",
  posterName: "Dodoma City Council",
  closingAt: "2026-12-02",
  ...over,
});

const fakeApi = (over: Partial<FeaturedApi> = {}): FeaturedApi => ({
  slots: vi.fn().mockResolvedValue({ used: 1, limit: 5 }),
  featured: vi.fn().mockResolvedValue([post()]),
  featurable: vi
    .fn()
    .mockResolvedValue([post({ id: "o2", title: "Accountant wanted", type: "job" })]),
  setFeatured: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const show = (api: FeaturedApi) =>
  act(async () => {
    render(<FeaturedManager api={api} />);
  });

const press = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("FeaturedManager (A12, O05)", () => {
  it("shows the slots used and each featured post as a tender, not an investment", async () => {
    await show(fakeApi());
    expect(screen.getByText("1 of 5 slots used")).toBeTruthy();
    expect(screen.getByText("Supply of school uniforms")).toBeTruthy();
    expect(screen.getByText("Tender · Dodoma City Council · Closes 2 December 2026")).toBeTruthy();
  });

  it("finds an open post and features it", async () => {
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Find an open post by title"), {
      target: { value: "account" },
    });
    await press("Find");
    expect(api.featurable).toHaveBeenCalledWith("account");
    await press("Feature Accountant wanted");
    expect(api.setFeatured).toHaveBeenCalledWith("o2", true);
    expect(screen.getByText("Featured.")).toBeTruthy();
  });

  it("removes a featured post", async () => {
    const api = fakeApi();
    await show(api);
    await press("Stop featuring Supply of school uniforms");
    expect(api.setFeatured).toHaveBeenCalledWith("o1", false);
    expect(screen.getByText("No longer featured.")).toBeTruthy();
  });

  it("turns Feature off when every slot is used", async () => {
    await show(fakeApi({ slots: vi.fn().mockResolvedValue({ used: 5, limit: 5 }) }));
    expect(screen.getByText("All featured slots are in use. Remove one first.")).toBeTruthy();
    await press("Find");
    expect(screen.getByRole("button", { name: "Feature Accountant wanted" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("explains the server's refusal", async () => {
    await show(fakeApi({ setFeatured: vi.fn().mockResolvedValue("slots_full") }));
    await press("Find");
    await press("Feature Accountant wanted");
    expect(screen.getAllByText("All featured slots are in use. Remove one first.").length).toBe(1);
  });
});

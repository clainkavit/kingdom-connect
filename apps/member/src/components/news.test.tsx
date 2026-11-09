import "../test-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberNewsApi } from "../lib/news";
import { News } from "./news";

afterEach(cleanup);

async function show(list: MemberNewsApi["list"]) {
  await act(async () => {
    render(<News api={{ list }} />);
  });
}

describe("News (S39)", () => {
  it("shows the empty state", async () => {
    await show(vi.fn().mockResolvedValue([]));
    expect(screen.getByText("No news yet")).toBeTruthy();
  });

  it("shows each item with its title and text, pinned items marked", async () => {
    await show(
      vi.fn().mockResolvedValue([
        {
          id: "n1",
          title: "Welcome week",
          body: "Join the welcome events.",
          imageUrl: null,
          pinned: true,
          publishedAt: "2026-11-06T09:00:00Z",
        },
      ]),
    );
    expect(screen.getByRole("heading", { name: "Welcome week" })).toBeTruthy();
    expect(screen.getByText("Join the welcome events.")).toBeTruthy();
    expect(screen.getByText(/^Pinned · Published/)).toBeTruthy();
  });

  it("offers a retry when the news cannot load", async () => {
    await show(vi.fn().mockRejectedValue(new Error("offline")));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

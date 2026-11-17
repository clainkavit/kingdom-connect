import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyPost } from "../lib/opportunities";
import type { PostResponse } from "../lib/responses";
import { PosterHome } from "./poster-home";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const post = (over: Partial<MyPost>): MyPost => ({
  id: "p1",
  type: "job",
  title: "Tailor, full time",
  status: "published",
  reason: null,
  closingAt: "2026-11-30T00:00:00Z",
  ...over,
});

const response = (over: Partial<PostResponse>): PostResponse => ({
  id: "r1",
  memberId: "m1",
  memberName: "Grace Swai",
  kind: "application",
  note: "",
  attachmentPath: "cv.pdf",
  status: "new",
  sentAt: new Date("2026-11-15T09:00:00Z"),
  ...over,
});

describe("PosterHome (Business-Dashboard)", () => {
  it("counts responses by status, lists the posts and lets the poster shortlist a new one", async () => {
    const forPost = vi.fn(async (id: string) =>
      id === "p1"
        ? [response({}), response({ id: "r2", memberName: "John Ngowi", status: "shortlisted" })]
        : [],
    );
    const setStatus = vi.fn().mockResolvedValue(true);
    const posts = vi
      .fn()
      .mockResolvedValue([
        post({}),
        post({ id: "p2", title: "Sales assistant", status: "pending_review" }),
      ]);
    await show(<PosterHome api={{ posts, responses: { forPost, setStatus } }} />);

    expect(forPost).toHaveBeenCalledWith("p1");
    expect(forPost).not.toHaveBeenCalledWith("p2");
    expect(screen.getByRole("heading", { name: "Responses to my posts" })).toBeTruthy();
    expect(screen.getByText("Across your 1 published post.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tailor, full time" }).getAttribute("href")).toBe(
      "/opportunities/p1/responses",
    );
    expect(screen.getByText("Waiting for staff")).toBeTruthy();
    expect(screen.getByText("Applied to Tailor, full time")).toBeTruthy();
    expect(screen.queryByText("John Ngowi")).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Shortlist" })));
    expect(setStatus).toHaveBeenCalledWith("r1", "shortlisted");
  });

  it("is absent for a poster with no posts", async () => {
    const posts = vi.fn().mockResolvedValue([]);
    await show(<PosterHome api={{ posts, responses: { forPost: vi.fn(), setStatus: vi.fn() } }} />);
    expect(screen.queryByRole("heading", { name: "Responses to my posts" })).toBeNull();
  });
});

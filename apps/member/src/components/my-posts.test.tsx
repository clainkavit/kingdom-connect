import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyPost, OpportunitiesApi } from "../lib/opportunities";
import { MyPosts } from "./my-posts";

afterEach(cleanup);

const post = (over: Partial<MyPost> = {}): MyPost => ({
  id: "p1",
  type: "job",
  title: "Accountant for a farm cooperative",
  status: "published",
  reason: null,
  closingAt: "2026-12-07",
  ...over,
});

const fakeApi = (posts: MyPost[], over: Partial<OpportunitiesApi> = {}): OpportunitiesApi => ({
  mine: vi.fn().mockResolvedValue(posts),
  load: vi.fn(),
  save: vi.fn(),
  close: vi.fn().mockResolvedValue("ok"),
  sectors: vi.fn(),
  regions: vi.fn(),
  districts: vi.fn(),
  pickPdf: vi.fn(),
  uploadTenderDocument: vi.fn(),
  ...over,
});

async function show(api: OpportunitiesApi) {
  await act(async () => {
    render(<MyPosts api={api} />);
  });
}

describe("MyPosts (S21)", () => {
  it("says so when nothing is posted, and links to the form", async () => {
    await show(fakeApi([]));
    expect(screen.getByText("You haven't posted anything yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Post an opportunity" }).getAttribute("href")).toBe(
      "/opportunities/new",
    );
  });

  it("lists each post with its type, status and closing date", async () => {
    await show(
      fakeApi([
        post(),
        post({
          id: "p2",
          title: "Partner for a bakery",
          type: "partnership",
          status: "pending_review",
        }),
      ]),
    );
    expect(screen.getByText("Accountant for a farm cooperative")).toBeTruthy();
    expect(screen.getByText(/^Job · Published · Closes /)).toBeTruthy();
    expect(screen.getByText(/^Partnership · Pending review · Closes /)).toBeTruthy();
  });

  it("shows why a draft was sent back, with Edit", async () => {
    await show(fakeApi([post({ status: "draft", reason: "The post is not clear enough" })]));
    expect(screen.getByText("Sent back: The post is not clear enough")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/opportunities/p1/edit",
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("closes a published post after a confirm", async () => {
    const api = fakeApi([post()]);
    await show(api);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close" })));
    expect(screen.getByText("Close this post now?")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close" })));
    expect(api.close).toHaveBeenCalledWith("p1");
    expect(api.mine).toHaveBeenCalledTimes(2);
  });

  it("gives the reason a post was removed", async () => {
    await show(
      fakeApi([post({ status: "removed", reason: "The post asks applicants for money" })]),
    );
    expect(screen.getByText("Removed: The post asks applicants for money")).toBeTruthy();
    expect(screen.queryByText(/^Sent back/)).toBeNull();
  });

  it("explains a hidden post", async () => {
    await show(fakeApi([post({ status: "hidden" })]));
    expect(screen.getByText("Our team is reviewing it.")).toBeTruthy();
  });
});

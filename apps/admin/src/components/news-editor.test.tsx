import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewsApi, NewsItem } from "@/lib/news";
import { NewsEditor } from "./news-editor";

afterEach(cleanup);

const item = (over: Partial<NewsItem>): NewsItem => ({
  id: "n1",
  title: "Pilot opens",
  body: "Kingdom Connect opens for the pilot.",
  imagePath: null,
  imageUrl: null,
  pinned: false,
  status: "published",
  publishedAt: "2026-11-06T09:00:00Z",
  ...over,
});

const fakeApi = (over: Partial<NewsApi> = {}): NewsApi => ({
  list: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  ...over,
});

async function show(api: NewsApi) {
  await act(async () => {
    render(<NewsEditor api={api} />);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("NewsEditor (A11)", () => {
  it("shows the empty state", async () => {
    await show(fakeApi());
    expect(screen.getByText("No news yet")).toBeTruthy();
  });

  it("lists drafts and pinned items", async () => {
    await show(
      fakeApi({
        list: vi
          .fn()
          .mockResolvedValue([
            item({ id: "n1", title: "Welcome week", pinned: true }),
            item({ id: "n2", title: "Draft note", status: "draft", publishedAt: null }),
          ]),
      }),
    );
    expect(screen.getByText("Welcome week")).toBeTruthy();
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("checks the form, then publishes a new item", async () => {
    const api = fakeApi();
    await show(api);
    await click("New item");
    await click("Publish");
    expect(screen.getByRole("alert").textContent).toBe(
      "Add a title of at least 3 characters and some text.",
    );
    expect(api.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Pilot opens" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Welcome, everyone." } });
    fireEvent.click(screen.getByLabelText("Pin to the top"));
    await click("Publish");
    expect(api.save).toHaveBeenCalledWith(null, {
      title: "Pilot opens",
      body: "Welcome, everyone.",
      pinned: true,
      publish: true,
      imagePath: null,
      image: null,
    });
  });

  it("saves an edited item as a draft", async () => {
    const api = fakeApi({ list: vi.fn().mockResolvedValue([item({})]) });
    await show(api);
    await click("Edit");
    await click("Save draft");
    expect(api.save).toHaveBeenCalledWith("n1", expect.objectContaining({ publish: false }));
  });
});

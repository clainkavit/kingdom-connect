import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardWidgetsApi, LatestItem } from "../lib/dashboard-widgets";
import type { MemberNewsApi } from "../lib/news";
import { LatestItems, NewsPreview } from "./dashboard-widgets";

afterEach(cleanup);

const show = (node: React.ReactElement) =>
  act(async () => {
    render(node);
  });

const item = (over: Partial<LatestItem> = {}): LatestItem => ({
  kind: "opportunity",
  id: "o1",
  title: "Accountant for a coffee trader",
  subtype: "job",
  sector: { en: "Agriculture", sw: "Kilimo" },
  publishedAt: new Date("2026-11-10T09:00:00+03:00"),
  ...over,
});

const fakeWidgets = (over: Partial<DashboardWidgetsApi> = {}): DashboardWidgetsApi => ({
  featured: vi.fn().mockResolvedValue([]),
  latest: vi.fn().mockResolvedValue([]),
  ...over,
});

describe("LatestItems (S08, D01)", () => {
  it("shows opportunities, training and ideas, each linking to its own page", async () => {
    await show(
      <LatestItems
        api={fakeWidgets({
          latest: vi.fn().mockResolvedValue([
            item(),
            item({
              kind: "training",
              id: "t1",
              title: "Bookkeeping basics",
              subtype: "online",
              sector: null,
            }),
            item({ kind: "idea", id: "i1", title: "Solar dryers", subtype: "prototype" }),
          ]),
        })}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Accountant for a coffee trader" }).getAttribute("href"),
    ).toBe("/opportunities/o1");
    expect(screen.getByRole("link", { name: "Bookkeeping basics" }).getAttribute("href")).toBe(
      "/training/t1",
    );
    expect(screen.getByRole("link", { name: "Solar dryers" }).getAttribute("href")).toBe(
      "/ideas/i1",
    );
    expect(screen.getByText("Training · Online · 10 November 2026")).toBeTruthy();
    expect(screen.getByText("Idea · Prototype · Agriculture · 10 November 2026")).toBeTruthy();
  });

  it("loads another tab, and shows no counts on any tab", async () => {
    const latest = vi.fn().mockResolvedValue([]);
    await show(<LatestItems api={fakeWidgets({ latest })} />);
    expect(latest).toHaveBeenLastCalledWith("all");
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Tenders" })));
    expect(latest).toHaveBeenLastCalledWith("tenders");
    for (const tab of ["All", "Jobs", "Training", "Tenders", "Investments", "Ideas"])
      expect(screen.getByRole("radio", { name: tab })).toBeTruthy();
    expect(screen.queryByText(/\(\d+\)/)).toBeNull();
    expect(screen.getByText("Nothing new here yet")).toBeTruthy();
  });

  const featuredPost = {
    id: "o9",
    type: "tender" as const,
    title: "Supply of school uniforms",
    sector: { en: "Textiles", sw: "Nguo" },
    posterName: "Dodoma City Council",
    closingAt: "2026-12-02",
  };

  it("puts featured posts first on All, marked Featured, and does not list them twice", async () => {
    await show(
      <LatestItems
        api={fakeWidgets({
          featured: vi.fn().mockResolvedValue([featuredPost]),
          latest: vi
            .fn()
            .mockResolvedValue([item({ id: "o9", title: "Supply of school uniforms" }), item()]),
        })}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/opportunities/o9");
    expect(screen.getAllByRole("link", { name: "Supply of school uniforms" })).toHaveLength(1);
    expect(
      screen.getByText("Featured · Tender · Dodoma City Council · Closes 2 December 2026"),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Featured opportunities" })).toBeNull();
  });

  it("shows featured posts only on All", async () => {
    await show(
      <LatestItems api={fakeWidgets({ featured: vi.fn().mockResolvedValue([featuredPost]) })} />,
    );
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Jobs" })));
    expect(screen.queryByText("Supply of school uniforms")).toBeNull();
  });

  it("still lists the latest when featured posts cannot load", async () => {
    await show(
      <LatestItems
        api={fakeWidgets({
          featured: vi.fn().mockRejectedValue(new Error("offline")),
          latest: vi.fn().mockResolvedValue([item()]),
        })}
      />,
    );
    expect(screen.getByText("Accountant for a coffee trader")).toBeTruthy();
  });

  it("offers a retry when a tab cannot load", async () => {
    const latest = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([item()]);
    await show(<LatestItems api={fakeWidgets({ latest })} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByText("Accountant for a coffee trader")).toBeTruthy();
  });
});

describe("NewsPreview (S08, D01)", () => {
  const news = (n: number): MemberNewsApi => ({
    list: vi.fn().mockResolvedValue(
      Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        title: `Update ${i}`,
        body: "Body",
        imageUrl: null,
        pinned: false,
        publishedAt: "2026-11-10T09:00:00+03:00",
      })),
    ),
  });

  it("shows the newest three and a link to all news", async () => {
    await show(<NewsPreview api={news(5)} />);
    expect(screen.getByText("Update 0")).toBeTruthy();
    expect(screen.getByText("Update 2")).toBeTruthy();
    expect(screen.queryByText("Update 3")).toBeNull();
    expect(screen.getByRole("link", { name: "All news" }).getAttribute("href")).toBe("/news");
  });

  it("has its own empty state", async () => {
    await show(<NewsPreview api={news(0)} />);
    expect(screen.getByText("No news yet")).toBeTruthy();
  });
});

import "../test-router";
import { COMPUTER, setWidth } from "../test-width";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventItem, EventsApi } from "../lib/events";
import type { PlansApi, PlanSummary } from "../lib/plans";
import type { TrainingApi, TrainingItem } from "../lib/training";
import { GrowthScreen } from "./growth";

beforeEach(() => setWidth(COMPUTER));
afterEach(cleanup);

const NOW = new Date("2026-11-14T06:00:00Z");

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: "e1",
  title: "Business owners breakfast",
  details: null,
  startsAt: "2026-11-14T05:00:00Z",
  venue: "Mkuyuni church hall",
  link: null,
  capacity: 40,
  registered: 10,
  status: "published",
  reviewReason: null,
  isMine: false,
  myStatus: "registered",
  myWaitlistPosition: null,
  ...over,
});

const training = (over: Partial<TrainingItem> = {}): TrainingItem => ({
  id: "t1",
  title: "Bookkeeping basics",
  provider: "Zawadi Lyimo",
  format: "online",
  details: null,
  venue: null,
  startsAt: "2026-11-18T15:00:00Z",
  seats: 20,
  registered: 14,
  downloadsAllowed: false,
  status: "published",
  reviewReason: null,
  isMine: false,
  myStatus: null,
  myWaitlistPosition: null,
  ...over,
});

const plan: PlanSummary = {
  id: "p1",
  status: "active",
  otherId: "m2",
  otherName: "Joseph Mushi",
  itemTitle: "Hardware shop",
  ideaId: "i1",
  startedByMe: true,
  milestones: 4,
  confirmed: 2,
  expiresAt: "2026-12-01",
  stage1AgreedAt: "2026-11-01",
};

const show = (ev: EventItem[], tr: TrainingItem[], plans: PlanSummary[] = []) =>
  act(async () => {
    render(
      <GrowthScreen
        events={{ feed: vi.fn().mockResolvedValue(ev) } as unknown as EventsApi}
        training={{ feed: vi.fn().mockResolvedValue(tr) } as unknown as TrainingApi}
        plans={{ mine: vi.fn().mockResolvedValue(plans) } as unknown as PlansApi}
        now={NOW}
      />,
    );
  });

describe("GrowthScreen (canvas Web-Growth)", () => {
  it("shows the four sections, what is coming up by day, and the member's plan", async () => {
    await show([event()], [training()], [plan]);
    for (const name of ["Events", "Training", "Ideas", "Milestone plans"])
      expect(screen.getByRole("link", { name })).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getAllByText("Going")).toHaveLength(2);
    expect(screen.getByText("6 seats left")).toBeTruthy();
    expect(screen.getByText("Hardware shop with Joseph Mushi")).toBeTruthy();
    expect(screen.getByText("2 of 4 steps confirmed")).toBeTruthy();
  });

  it("filters to what the member is going to", async () => {
    await show([event()], [training()]);
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Going" })));
    expect(screen.getByText("Business owners breakfast")).toBeTruthy();
    expect(screen.queryByText("Bookkeeping basics")).toBeNull();
  });

  it("says when nothing is coming up", async () => {
    await show([], []);
    expect(screen.getByText("Nothing coming up")).toBeTruthy();
  });
});

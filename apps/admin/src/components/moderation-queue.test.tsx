import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventModerationApi, PendingEvent } from "@/lib/events";
import type { IdeaModerationApi, PendingIdea } from "@/lib/ideas";
import type { PendingTraining, TrainingModerationApi } from "@/lib/training";
import { ModerationQueue } from "./moderation-queue";

afterEach(cleanup);

const pending = (over: Partial<PendingEvent> = {}): PendingEvent => ({
  id: "e1",
  title: "Business breakfast",
  details: "Meet other members over breakfast.",
  startsAt: "2099-11-10T05:30:00Z",
  venue: "Gold Crest Hotel, Mwanza",
  link: null,
  capacity: 40,
  posterUsername: "neema_builders",
  submittedAt: "2026-11-07T06:00:00Z",
  ...over,
});

const fakeApi = (over: Partial<EventModerationApi> = {}): EventModerationApi => ({
  queue: vi.fn().mockResolvedValue([pending()]),
  decide: vi.fn().mockResolvedValue("ok"),
  post: vi.fn().mockResolvedValue("published"),
  ...over,
});

const fakeTraining = (over: Partial<TrainingModerationApi> = {}): TrainingModerationApi => ({
  queue: vi.fn().mockResolvedValue([]),
  decide: vi.fn().mockResolvedValue("ok"),
  post: vi.fn().mockResolvedValue("published"),
  ...over,
});

const fakeIdeas = (over: Partial<IdeaModerationApi> = {}): IdeaModerationApi => ({
  queue: vi.fn().mockResolvedValue([]),
  decide: vi.fn().mockResolvedValue("ok"),
  ...over,
});

async function show(
  api: EventModerationApi,
  training: TrainingModerationApi = fakeTraining(),
  ideas: IdeaModerationApi = fakeIdeas(),
) {
  await act(async () => {
    render(<ModerationQueue events={api} training={training} ideas={ideas} />);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("ModerationQueue events (A04, T03)", () => {
  it("lists events waiting for review with the poster", async () => {
    await show(fakeApi());
    expect(screen.getByRole("heading", { name: "Events waiting for review" })).toBeTruthy();
    expect(screen.getByText("Business breakfast")).toBeTruthy();
    expect(screen.getByText(/Posted by neema_builders/)).toBeTruthy();
  });

  it("approves an event", async () => {
    const api = fakeApi();
    await show(api);
    await click("Approve");
    expect(api.decide).toHaveBeenCalledWith("e1", true, "");
  });

  it("needs a reason to send an event back", async () => {
    const api = fakeApi();
    await show(api);
    await click("Send back");
    await click("Send back");
    expect(screen.getByRole("alert").textContent).toBe("Add the reason the poster will see.");
    expect(api.decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason the poster will see"), {
      target: { value: "Please add the hall name" },
    });
    await click("Send back");
    expect(api.decide).toHaveBeenCalledWith("e1", false, "Please add the hall name");
  });

  it("says when another admin has already decided", async () => {
    await show(fakeApi({ decide: vi.fn().mockResolvedValue("already_decided") }));
    await click("Approve");
    expect(screen.getByRole("alert").textContent).toBe(
      "Another admin has already decided this event.",
    );
  });

  it("posts an event as admin, which publishes at once", async () => {
    const api = fakeApi({ queue: vi.fn().mockResolvedValue([]) });
    await show(api);
    await click("Post an event as admin");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Pilot open day" } });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) },
    });
    fireEvent.change(screen.getByLabelText(/^Start time/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/^Venue/), { target: { value: "Mkuyuni church hall" } });
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "120" } });
    await click("Publish");
    expect(api.post).toHaveBeenCalledWith(expect.objectContaining({ title: "Pilot open day" }));
    expect(screen.getByRole("status").textContent).toBe("Published. Members can see it now.");
  });
});

const pendingTraining = (over: Partial<PendingTraining> = {}): PendingTraining => ({
  id: "t1",
  title: "Bookkeeping basics",
  provider: "Mwanza Business Centre",
  format: "in_person",
  details: null,
  venue: "Mkuyuni church hall",
  startsAt: null,
  seats: 30,
  posterUsername: "asha_m",
  submittedAt: "2026-11-07T06:00:00Z",
  ...over,
});

describe("ModerationQueue training (A04, T01)", () => {
  it("lists training waiting for review and approves it", async () => {
    const training = fakeTraining({ queue: vi.fn().mockResolvedValue([pendingTraining()]) });
    await show(fakeApi({ queue: vi.fn().mockResolvedValue([]) }), training);
    expect(screen.getByRole("heading", { name: "Training waiting for review" })).toBeTruthy();
    expect(screen.getByText(/By Mwanza Business Centre · Self-paced/)).toBeTruthy();
    await click("Approve");
    expect(training.decide).toHaveBeenCalledWith("t1", true, "");
  });

  it("posts self-paced online training as admin", async () => {
    const training = fakeTraining();
    await show(fakeApi({ queue: vi.fn().mockResolvedValue([]) }), training);
    await click("Post a training as admin");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Savings groups" } });
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "Kingdom Connect" } });
    fireEvent.click(screen.getByLabelText("Online"));
    fireEvent.click(screen.getByLabelText("Self-paced, no fixed date"));
    fireEvent.change(screen.getByLabelText("Seats"), { target: { value: "200" } });
    await click("Publish");
    expect(training.post).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Savings groups", format: "online", selfPaced: true }),
    );
    expect(screen.getByRole("status").textContent).toBe("Published. Members can see it now.");
  });
});

const pendingIdea = (over: Partial<PendingIdea> = {}): PendingIdea => ({
  id: "i1",
  title: "Solar dryers for fruit farmers",
  problem: "Farmers lose much of their mango harvest before market.",
  sectorEn: "Agriculture",
  sectorSw: "Kilimo",
  stage: "prototype",
  seeking: "investor",
  investmentMin: 10000000,
  investmentMax: 50000000,
  showOwner: false,
  description: "A low-cost solar dryer built from local materials.",
  businessModel: null,
  market: null,
  financials: "Each dryer pays back in one season.",
  team: null,
  ownerUsername: "asha_m",
  ...over,
});

describe("ModerationQueue ideas (A04, I01)", () => {
  it("shows staff the whole idea, including the confidential details, and sends it back", async () => {
    const ideas = fakeIdeas({ queue: vi.fn().mockResolvedValue([pendingIdea()]) });
    await show(fakeApi({ queue: vi.fn().mockResolvedValue([]) }), fakeTraining(), ideas);
    expect(screen.getByRole("heading", { name: "Ideas waiting for moderation" })).toBeTruthy();
    expect(
      screen.getByText(
        "Agriculture · Prototype · Investor · TZS 10,000,000 – TZS 50,000,000 · Posted by asha_m · Shared without a name",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Financials: Each dryer pays back in one season\./)).toBeTruthy();
    await click("Send back");
    fireEvent.change(screen.getByLabelText("Reason the poster will see"), {
      target: { value: "Please remove the price list" },
    });
    await click("Send back");
    expect(ideas.decide).toHaveBeenCalledWith("i1", false, "Please remove the price list");
  });
});

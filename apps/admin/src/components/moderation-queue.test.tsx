import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventModerationApi, PendingEvent } from "@/lib/events";
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

async function show(api: EventModerationApi) {
  await act(async () => {
    render(<ModerationQueue events={api} />);
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

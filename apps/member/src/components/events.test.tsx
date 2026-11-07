import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventItem, EventsApi } from "../lib/events";
import { EventDetail, EventForm, EventsList } from "./events";

afterEach(cleanup);

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: "e1",
  title: "Business breakfast",
  details: "Meet other members over breakfast.",
  startsAt: "2099-11-10T05:30:00Z",
  venue: "Gold Crest Hotel, Mwanza",
  link: null,
  capacity: 2,
  registered: 1,
  status: "published",
  reviewReason: null,
  isMine: false,
  myStatus: null,
  myWaitlistPosition: null,
  ...over,
});

const fakeApi = (over: Partial<EventsApi> = {}): EventsApi => ({
  feed: vi.fn().mockResolvedValue([event()]),
  canPost: vi.fn().mockResolvedValue(false),
  save: vi.fn().mockResolvedValue({ result: "pending_review", eventId: "e9" }),
  register: vi.fn().mockResolvedValue({ result: "registered", waitlistPosition: null }),
  cancel: vi.fn().mockResolvedValue("ok"),
  registrants: vi.fn().mockResolvedValue([]),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

describe("EventsList (S38)", () => {
  it("lists events with places left, and locks posting below Level 2", async () => {
    await show(<EventsList api={fakeApi()} />);
    expect(screen.getByText("Business breakfast")).toBeTruthy();
    expect(screen.getByText("1 of 2 places left")).toBeTruthy();
    expect(
      screen.getByText(
        "Posting events is for members with a verified business (Level 2) and above.",
      ),
    ).toBeTruthy();
  });

  it("offers posting to Level 2 and up, and marks an event waiting for review", async () => {
    await show(
      <EventsList
        api={fakeApi({
          canPost: vi.fn().mockResolvedValue(true),
          feed: vi.fn().mockResolvedValue([event({ isMine: true, status: "pending_review" })]),
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "Post an event" }).getAttribute("href")).toBe(
      "/events/new",
    );
    expect(screen.getByText("Waiting for review")).toBeTruthy();
  });
});

describe("EventDetail (S38)", () => {
  it("registers, or offers the waitlist when the event is full", async () => {
    const api = fakeApi();
    await show(<EventDetail api={api} eventId="e1" />);
    await click("Register");
    expect(api.register).toHaveBeenCalledWith("e1");
    cleanup();

    await show(
      <EventDetail
        api={fakeApi({ feed: vi.fn().mockResolvedValue([event({ registered: 2 })]) })}
        eventId="e1"
      />,
    );
    expect(screen.getByText("Full. You can join the waitlist.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join the waitlist" })).toBeTruthy();
  });

  it("shows a waitlist spot with a way to leave it", async () => {
    const api = fakeApi({
      feed: vi.fn().mockResolvedValue([event({ myStatus: "waitlisted", myWaitlistPosition: 3 })]),
    });
    await show(<EventDetail api={api} eventId="e1" />);
    expect(screen.getByText("You are number 3 on the waitlist.")).toBeTruthy();
    await click("Leave the waitlist");
    expect(api.cancel).toHaveBeenCalledWith("e1");
  });

  it("shows the poster the registrants by name", async () => {
    await show(
      <EventDetail
        api={fakeApi({
          feed: vi.fn().mockResolvedValue([event({ isMine: true })]),
          registrants: vi.fn().mockResolvedValue([
            {
              memberId: "m2",
              fullName: "Neema Joseph",
              headline: "Teacher",
              status: "registered",
              waitlistPosition: null,
            },
          ]),
        })}
        eventId="e1"
      />,
    );
    expect(screen.getByRole("link", { name: "Neema Joseph" }).getAttribute("href")).toBe(
      "/profile/m2",
    );
  });

  it("says when the event is not available", async () => {
    await show(<EventDetail api={fakeApi({ feed: vi.fn().mockResolvedValue([]) })} eventId="zz" />);
    expect(screen.getByText("This event is not available.")).toBeTruthy();
  });
});

describe("EventForm (S38)", () => {
  it("checks the form, then sends it for review", async () => {
    const api = fakeApi({ canPost: vi.fn().mockResolvedValue(true) });
    await show(<EventForm api={api} eventId={null} />);
    await click("Send for review");
    expect(screen.getByRole("alert").textContent).toBe("Add a title of 3 to 120 characters.");
    expect(api.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Business breakfast" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2099-11-10" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "08:30" } });
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "40" } });
    await click("Send for review");
    expect(screen.getByRole("alert").textContent).toBe(
      "Pick a date and time at least 2 hours from now and within a year.",
    );

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) },
    });
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "Gold Crest Hotel" } });
    await click("Send for review");
    expect(api.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ title: "Business breakfast", capacity: "40" }),
      true,
    );
    expect(router.pushed).toContain("/events/e9");
  });

  it("shows the server's reason, such as contact details", async () => {
    const api = fakeApi({
      canPost: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue({ result: "contact_details", eventId: null }),
    });
    await show(<EventForm api={api} eventId={null} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Open day" } });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) },
    });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "Church hall" } });
    fireEvent.change(screen.getByLabelText("Places"), { target: { value: "20" } });
    await click("Save draft");
    expect(screen.getByRole("alert").textContent).toBe(
      "Remove phone numbers and email addresses. Members contact each other inside Kingdom Connect.",
    );
  });

  it("is locked below Level 2", async () => {
    await show(<EventForm api={fakeApi()} eventId={null} />);
    expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull();
    expect(screen.getByRole("link", { name: "Verify your business" })).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { calendarLink, checkEvent, eventStart, type EventDraft } from "./event-rules";

const now = new Date("2026-11-07T06:00:00Z"); // 09:00 in Tanzania

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  title: "Business breakfast",
  details: "",
  date: "2026-11-10",
  time: "08:30",
  venue: "Gold Crest Hotel, Mwanza",
  link: "",
  capacity: "40",
  ...over,
});

describe("eventStart", () => {
  it("reads the date and time as Tanzania time", () => {
    expect(eventStart("2026-11-10", "08:30")?.toISOString()).toBe("2026-11-10T05:30:00.000Z");
    expect(eventStart("2026-11-10", "8:05")?.toISOString()).toBe("2026-11-10T05:05:00.000Z");
  });

  it("refuses times and days that do not exist", () => {
    expect(eventStart("2026-11-10", "24:00")).toBeNull();
    expect(eventStart("2026-04-31", "10:00")).toBeNull();
    expect(eventStart("10/11/2026", "10:00")).toBeNull();
  });
});

describe("checkEvent", () => {
  it("accepts a complete event", () => {
    expect(checkEvent(draft(), now)).toBeNull();
    expect(checkEvent(draft({ venue: "", link: "https://meet.example.test/kc" }), now)).toBeNull();
  });

  it("names the first problem", () => {
    expect(checkEvent(draft({ title: "Hi" }), now)).toBe("title");
    expect(checkEvent(draft({ date: "2026-11-07", time: "10:30" }), now)).toBe("start");
    expect(checkEvent(draft({ date: "2027-12-01" }), now)).toBe("start");
    expect(checkEvent(draft({ venue: "" }), now)).toBe("venue_or_link");
    expect(checkEvent(draft({ link: "http://example.test" }), now)).toBe("link");
    expect(checkEvent(draft({ capacity: "0" }), now)).toBe("capacity");
    expect(checkEvent(draft({ capacity: "ten" }), now)).toBe("capacity");
    expect(checkEvent(draft({ details: "x".repeat(2001) }), now)).toBe("details");
  });
});

describe("calendarLink", () => {
  it("fills in a two-hour Google Calendar entry", () => {
    const url = new URL(
      calendarLink({
        title: "Business breakfast",
        startsAt: "2026-11-10T05:30:00Z",
        venue: "Gold Crest Hotel",
        link: null,
        details: "Bring business cards",
      }),
    );
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe("Business breakfast");
    expect(url.searchParams.get("dates")).toBe("20261110T053000Z/20261110T073000Z");
    expect(url.searchParams.get("location")).toBe("Gold Crest Hotel");
  });
});

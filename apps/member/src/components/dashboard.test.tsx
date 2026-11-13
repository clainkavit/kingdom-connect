import "../test-router";
import { COMPUTER, PHONE, setWidth } from "../test-width";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsApi } from "../lib/connections";
import type { DashboardApi, Welcome } from "../lib/dashboard";
import { DashboardScreen } from "./dashboard";

afterEach(cleanup);

const welcome = (over: Partial<Welcome> = {}): Welcome => ({
  fullName: "Dash Member",
  region: { en: "Mwanza", sw: "Mwanza" },
  district: { en: "Ilemela", sw: "Ilemela" },
  level: 1,
  postingPaused: false,
  ...over,
});

const fakeConnections = (over: Partial<ConnectionsApi> = {}) =>
  ({
    received: vi.fn().mockResolvedValue([]),
    sent: vi.fn().mockResolvedValue([]),
    answer: vi.fn().mockResolvedValue(true),
    ...over,
  }) as unknown as ConnectionsApi;

const fakeApi = (
  w: Welcome | null = welcome(),
  registrations: Awaited<ReturnType<DashboardApi["registrations"]>> = [],
): DashboardApi => ({
  welcome: vi.fn().mockResolvedValue(w),
  registrations: vi.fn().mockResolvedValue(registrations),
});

async function show(api: DashboardApi, connections: ConnectionsApi) {
  await act(async () => {
    render(
      <DashboardScreen
        api={api}
        connections={connections}
        today={new Date("2026-11-04T09:00:00+03:00")}
      />,
    );
  });
}

describe("DashboardScreen (S08)", () => {
  it("welcomes the member with the date and their location", async () => {
    await show(fakeApi(), fakeConnections());
    expect(screen.getByText("Hello, Dash Member")).toBeTruthy();
    expect(screen.getByText("4 November 2026 · Ilemela, Mwanza")).toBeTruthy();
  });

  it("answers connection requests inline", async () => {
    const connections = fakeConnections({
      received: vi.fn().mockResolvedValue([
        {
          requestId: "q1",
          memberId: "m2",
          fullName: "Asking Person",
          headline: "Teacher",
          photoUrl: null,
          note: "We met on Sunday",
        },
      ]),
    });
    await show(fakeApi(), connections);
    expect(screen.getByText("We met on Sunday")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Accept" })));
    expect(connections.answer).toHaveBeenCalledWith("q1", true);
  });

  it("gives each widget its own empty state", async () => {
    await show(fakeApi(), fakeConnections());
    expect(screen.getByText("No requests waiting")).toBeTruthy();
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
  });

  it("lists requests you sent under my activity", async () => {
    await show(
      fakeApi(),
      fakeConnections({
        sent: vi.fn().mockResolvedValue([
          {
            requestId: "s1",
            memberId: "m3",
            fullName: "Waiting Person",
            headline: "",
            photoUrl: null,
          },
        ]),
      }),
    );
    expect(screen.getByText("Waiting Person")).toBeTruthy();
  });

  it("hides Post an opportunity below Level 3, with the path to upgrade", async () => {
    await show(fakeApi(), fakeConnections());
    expect(screen.getByRole("link", { name: "Share an idea" }).getAttribute("href")).toBe(
      "/ideas/new",
    );
    expect(screen.getByRole("link", { name: "Scan for opportunities" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Post training" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Post an opportunity" })).toBeNull();
    expect(screen.getByText("Verify your business to post opportunities.")).toBeTruthy();
  });

  it("asks a Level 2 business to verify further before posting opportunities", async () => {
    await show(fakeApi(welcome({ level: 2 })), fakeConnections());
    expect(screen.queryByRole("link", { name: "Post an opportunity" })).toBeNull();
    expect(screen.getByText("Verify your business to post opportunities.")).toBeTruthy();
  });

  it("hides every posting action while posting is paused", async () => {
    await show(fakeApi(welcome({ level: 3, postingPaused: true })), fakeConnections());
    for (const name of ["Share an idea", "Post training", "Post an opportunity"])
      expect(screen.queryByRole("link", { name })).toBeNull();
    expect(screen.getByRole("link", { name: "Scan for opportunities" })).toBeTruthy();
    expect(
      screen.getByText("Your posting is paused until an Administrator lifts it."),
    ).toBeTruthy();
  });

  it("offers Post an opportunity to a Level 3 poster", async () => {
    await show(fakeApi(welcome({ level: 3 })), fakeConnections());
    expect(screen.getByRole("link", { name: "Post an opportunity" }).getAttribute("href")).toBe(
      "/opportunities/new",
    );
    expect(screen.queryByText("Verify your business to post opportunities.")).toBeNull();
  });

  it("shows no community counts at all", async () => {
    await show(fakeApi(), fakeConnections());
    expect(
      screen.queryByText(/verified members|registered businesses|ideas in the pool/i),
    ).toBeNull();
  });
});

describe("My activity: training and events (T01)", () => {
  it("lists upcoming training and events, with a waitlist spot", async () => {
    await show(
      fakeApi(welcome(), [
        {
          kind: "training",
          id: "t1",
          title: "Bookkeeping basics",
          startsAt: null,
          status: "registered",
          waitlistPosition: null,
        },
        {
          kind: "event",
          id: "e1",
          title: "Business breakfast",
          startsAt: "2099-11-10T05:30:00Z",
          status: "waitlisted",
          waitlistPosition: 2,
        },
      ]),
      fakeConnections(),
    );
    expect(screen.getByRole("link", { name: "Bookkeeping basics" }).getAttribute("href")).toBe(
      "/training/t1",
    );
    expect(screen.getByText(/^Training · Self-paced · You have a seat\.$/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Business breakfast" }).getAttribute("href")).toBe(
      "/events/e1",
    );
    expect(screen.getByText(/You are number 2 on the waitlist\.$/)).toBeTruthy();
    expect(screen.queryByText("Nothing here yet")).toBeNull();
  });
});

describe("Home layout (13 Nov 2026 redesign)", () => {
  const me = {
    memberId: "m1",
    own: true,
    fullName: "Dash Member",
    headline: "",
    bio: "",
    profession: "Accountant",
    experience: "",
    certifications: "",
    regionId: "r1",
    districtId: null,
    location: "Mwanza",
    study: { institution: "", course: "", year: null },
    skills: [],
    photoUrl: null,
    hidden: false,
    contact: null,
  };

  const showWith = (width: number) => {
    setWidth(width);
    return act(async () => {
      render(
        <DashboardScreen
          api={fakeApi()}
          connections={fakeConnections()}
          profile={vi.fn().mockResolvedValue(me)}
          today={new Date("2026-11-04T09:00:00+03:00")}
        />,
      );
    });
  };

  it("is titled Home, with the member's column: profile, next steps and shortcuts", async () => {
    await showWith(COMPUTER);
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My profile" }).getAttribute("href")).toBe("/profile");
    expect(screen.getByRole("heading", { name: "Next steps" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saved opportunities" }).getAttribute("href")).toBe(
      "/opportunities/saved",
    );
    expect(screen.getByRole("link", { name: "My connections" }).getAttribute("href")).toBe(
      "/connections",
    );
  });

  it("keeps the same pieces on a phone, stacked", async () => {
    await showWith(PHONE);
    expect(screen.getByRole("heading", { name: "Next steps" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My responses" })).toBeTruthy();
  });
});

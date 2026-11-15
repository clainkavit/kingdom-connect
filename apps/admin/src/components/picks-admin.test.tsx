import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PickAdminApi, PickQueueItem, Suggestion } from "@/lib/picks";
import { PicksAdmin } from "./picks-admin";

afterEach(cleanup);

const item = (over: Partial<PickQueueItem> = {}): PickQueueItem => ({
  requestId: "q1",
  opportunityId: "o1",
  title: "Accountant, full time",
  posterName: "Rehema Mollel",
  wanted: 10,
  note: "Must be in Moshi.",
  status: "picking",
  asked: 1,
  agreed: 0,
  declined: 0,
  expired: 0,
  ...over,
});

const suggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  memberId: "m1",
  fullName: "Baraka Mwakyusa",
  headline: "Auditor",
  skillMatches: 4,
  sameSector: true,
  sameRegion: false,
  verifiedBusiness: false,
  finishedPlans: 2,
  ratingsTotal: 3,
  ratingsAgain: 3,
  upheldReports: 0,
  ...over,
});

const fakeApi = (over: Partial<PickAdminApi> = {}): PickAdminApi => ({
  queue: vi.fn().mockResolvedValue([item()]),
  suggestions: vi
    .fn()
    .mockResolvedValue([suggestion(), suggestion({ memberId: "m2", fullName: "Grace Swai" })]),
  people: vi
    .fn()
    .mockResolvedValue([
      {
        id: "p0",
        memberId: "m9",
        fullName: "Daniel Kessy",
        headline: null,
        why: "x",
        status: "asked",
      },
    ]),
  findMember: vi.fn().mockResolvedValue(null),
  ask: vi.fn().mockResolvedValue(true),
  send: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const show = (api: PickAdminApi) =>
  act(async () => {
    render(<PicksAdmin api={api} />);
  });

const press = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("PicksAdmin (A18)", () => {
  it("says when no post is waiting", async () => {
    await show(fakeApi({ queue: vi.fn().mockResolvedValue([]) }));
    expect(screen.getByText("No posts waiting for a pick")).toBeTruthy();
  });

  it("shows the post, the poster's note, suggestions with fit and record lines, and progress", async () => {
    await show(fakeApi());
    expect(screen.getByRole("heading", { name: "Accountant, full time" })).toBeTruthy();
    expect(screen.getByText("Must be in Moshi.")).toBeTruthy();
    expect(screen.getAllByText(/4 matching skills · same sector/)).toHaveLength(2);
    expect(
      screen.getAllByText(
        /2 plans finished · 3 of 3 would work with them again · 0 upheld reports/,
      ),
    ).toHaveLength(2);
    expect(screen.getByText("Daniel Kessy")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText(/It never uses the investor flag/)).toBeTruthy();
  });

  it("needs a why for each ticked member, then asks them", async () => {
    const api = fakeApi();
    await show(api);
    await act(async () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Pick Baraka Mwakyusa" })),
    );
    await press("Ask the ticked members");
    expect(screen.getByText(/Write why you picked each ticked member/)).toBeTruthy();
    expect(api.ask).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Why we picked them (the poster sees this)"), {
        target: { value: "Eight years of audit work." },
      }),
    );
    await press("Ask the ticked members");
    expect(api.ask).toHaveBeenCalledWith("q1", [
      { memberId: "m1", why: "Eight years of audit work." },
    ]);
    expect(screen.getByText("1 member asked.")).toBeTruthy();
  });

  it("will not send a list before anyone said yes", async () => {
    await show(fakeApi({ send: vi.fn().mockResolvedValue("nobody_agreed") }));
    await press("Send the list to the poster");
    expect(screen.getByText(/Nobody has said yes yet/)).toBeTruthy();
  });

  it("adds a member the suggestions missed, by username", async () => {
    const api = fakeApi({
      findMember: vi
        .fn()
        .mockResolvedValue(suggestion({ memberId: "m7", fullName: "Asha Kileo", skillMatches: 0 })),
    });
    await show(api);
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Add a member"), { target: { value: "asha" } }),
    );
    await press("Add");
    expect(api.findMember).toHaveBeenCalledWith("asha");
    expect(
      (screen.getByRole("checkbox", { name: "Pick Asha Kileo" }) as HTMLInputElement).checked,
    ).toBe(true);
  });
});

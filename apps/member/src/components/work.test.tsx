import "../test-router";
import { COMPUTER, setWidth } from "../test-width";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostResponse, ResponsesApi } from "../lib/responses";
import type { Engagement, WorkApi } from "../lib/work";
import { PostResponses } from "./responses";
import { MyWork, ProfileReferences, RateWork } from "./work";

beforeEach(() => setWidth(COMPUTER));
afterEach(cleanup);

const DAY = 24 * 60 * 60 * 1000;

const engagement = (over: Partial<Engagement> = {}): Engagement => ({
  id: "e1",
  responseId: "r1",
  role: "worker",
  otherName: "Rehema Mollel",
  title: "Tailor, full time",
  markedAt: new Date(),
  confirmedAt: new Date(),
  deniedAt: null,
  closesAt: new Date(Date.now() + 9 * DAY),
  iRated: false,
  ...over,
});

const fakeWork = (over: Partial<WorkApi> = {}): WorkApi => ({
  engagements: vi.fn().mockResolvedValue([]),
  markHired: vi.fn().mockResolvedValue(true),
  confirm: vi.fn().mockResolvedValue(true),
  rate: vi.fn().mockResolvedValue("ok"),
  reply: vi.fn().mockResolvedValue("ok"),
  references: vi.fn().mockResolvedValue(null),
  ...over,
});

const show = (node: React.ReactElement) =>
  act(async () => {
    render(node);
  });

const press = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

const choose = (group: string, option: string) =>
  act(async () =>
    fireEvent.click(
      screen.getByRole("radiogroup", { name: group }).querySelector(`[aria-label="${option}"]`)!,
    ),
  );

describe("MyWork and Confirm the work (S52)", () => {
  it("asks the worker to confirm, and saying yes reloads the list", async () => {
    const engagements = vi
      .fn()
      .mockResolvedValueOnce([engagement({ confirmedAt: null, closesAt: null })])
      .mockResolvedValue([engagement()]);
    const api = fakeWork({ engagements });
    await show(<MyWork api={api} />);
    expect(
      screen.getByText("Rehema Mollel marked you as hired for Tailor, full time."),
    ).toBeTruthy();
    await press("Yes, I did this work");
    expect(api.confirm).toHaveBeenCalledWith("e1", true);
    expect(screen.getByText("9 days left to rate")).toBeTruthy();
  });

  it("tells the poster they are waiting, and shows a denied engagement opens nothing", async () => {
    const api = fakeWork({
      engagements: vi
        .fn()
        .mockResolvedValue([
          engagement({ id: "e1", role: "poster", confirmedAt: null, closesAt: null }),
          engagement({ id: "e2", confirmedAt: null, deniedAt: new Date(), closesAt: null }),
        ]),
    });
    await show(<MyWork api={api} />);
    expect(screen.getByText("Waiting for Rehema Mollel to confirm the work.")).toBeTruthy();
    expect(screen.getByText("Not confirmed. No rating opens for this work.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Rate the work" })).toBeNull();
  });
});

describe("RateWork (S53)", () => {
  it("is hidden until both rate, needs every score, and sends once", async () => {
    const engagements = vi
      .fn()
      .mockResolvedValueOnce([engagement()])
      .mockResolvedValue([engagement({ iRated: true })]);
    const api = fakeWork({ engagements });
    await show(<RateWork api={api} engagementId="e1" />);
    expect(screen.getByText(/^Hidden\. Rehema Mollel cannot see your rating/)).toBeTruthy();
    await press("Send rating");
    expect(screen.getByText(/Give all four scores/)).toBeTruthy();
    expect(api.rate).not.toHaveBeenCalled();
    for (const q of [
      "Did what they promised, on time",
      "Quality of the work",
      "Communication",
      "Honesty and respect",
    ])
      await choose(q, "5");
    await choose("Would you work with Rehema Mollel again?", "Yes");
    await press("Send rating");
    expect(api.rate).toHaveBeenCalledWith(
      "e1",
      { onTime: 5, quality: 5, communication: 5, honesty: 5 },
      true,
      "",
      "",
    );
    expect(screen.getByText("Rating sent. It cannot be changed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send rating" })).toBeNull();
  });

  it("refuses a comment with contact details", async () => {
    const api = fakeWork({
      engagements: vi.fn().mockResolvedValue([engagement()]),
      rate: vi.fn().mockResolvedValue("contact_details"),
    });
    await show(<RateWork api={api} engagementId="e1" />);
    for (const q of [
      "Did what they promised, on time",
      "Quality of the work",
      "Communication",
      "Honesty and respect",
    ])
      await choose(q, "4");
    await choose("Would you work with Rehema Mollel again?", "No");
    await press("Send rating");
    expect(screen.getByText(/Take out phone numbers/)).toBeTruthy();
  });

  it("is read only once the window closed", async () => {
    const api = fakeWork({
      engagements: vi
        .fn()
        .mockResolvedValue([engagement({ closesAt: new Date(Date.now() - DAY) })]),
    });
    await show(<RateWork api={api} engagementId="e1" />);
    expect(screen.getByText("The 14 days to rate this work have ended.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send rating" })).toBeNull();
  });
});

describe("ProfileReferences (S11)", () => {
  const refs = {
    total: 3,
    againCount: 3,
    averages: { onTime: 4.9, quality: 4.8, communication: 4.6, honesty: 5 },
    items: [
      {
        id: "g1",
        raterName: "Rehema Mollel",
        title: "Tailor",
        ratedAt: new Date("2026-10-20"),
        comment: "Every uniform was ready a day early.",
        reply: null,
      },
    ],
  };

  it("is absent under 3 references for another member", async () => {
    await show(<ProfileReferences api={fakeWork()} memberId="m1" name="Grace" own={false} />);
    expect(screen.queryByRole("heading", { name: "Work references" })).toBeNull();
  });

  it("tells the owner their references appear once they have 3", async () => {
    await show(<ProfileReferences api={fakeWork()} memberId="m1" name="Grace" own />);
    expect(screen.getByText("Your references appear once you have 3.")).toBeTruthy();
  });

  it("shows the summary, averages and comments, and lets the owner reply once", async () => {
    const api = fakeWork({ references: vi.fn().mockResolvedValue(refs) });
    await show(<ProfileReferences api={api} memberId="m1" name="Grace" own />);
    expect(
      screen.getByText("3 of 3 members who worked with Grace would work with them again"),
    ).toBeTruthy();
    expect(screen.getByText("4.9")).toBeTruthy();
    expect(screen.getByText("Every uniform was ready a day early.")).toBeTruthy();
    await press("Reply");
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Thank you." } }),
    );
    await press("Send reply");
    expect(api.reply).toHaveBeenCalledWith("g1", "Thank you.");
  });
});

describe("Mark as hired (S21)", () => {
  const response = (over: Partial<PostResponse> = {}): PostResponse => ({
    id: "r1",
    memberId: "m3",
    memberName: "John Ngowi",
    kind: "application",
    note: "",
    attachmentPath: null,
    status: "shortlisted",
    sentAt: new Date("2026-11-01"),
    ...over,
  });
  const responsesApi = (rows: PostResponse[]): ResponsesApi =>
    ({ forPost: vi.fn().mockResolvedValue(rows), thread: vi.fn() }) as unknown as ResponsesApi;

  it("marks a shortlisted response as hired after a confirm", async () => {
    const work = fakeWork();
    await show(<PostResponses api={responsesApi([response()])} work={work} opportunityId="o1" />);
    expect(screen.getByText("Why mark someone as hired?")).toBeTruthy();
    await press("Mark as hired");
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Mark as hired" })[0]!),
    );
    expect(work.markHired).toHaveBeenCalledWith("r1");
  });

  it("reads Hired, waiting for the member until they confirm", async () => {
    const work = fakeWork({
      engagements: vi
        .fn()
        .mockResolvedValue([engagement({ role: "poster", confirmedAt: null, closesAt: null })]),
    });
    await show(
      <PostResponses
        api={responsesApi([response({ status: "hired" })])}
        work={work}
        opportunityId="o1"
      />,
    );
    expect(screen.getByText("Hired · waiting for John Ngowi")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as hired" })).toBeNull();
  });
});

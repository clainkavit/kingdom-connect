import "../test-router";
import { COMPUTER, setWidth } from "../test-width";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PickInvite, PickPerson, PickRequest, PicksApi } from "../lib/picks";
import { FindModeFields, PickedInvites, PickProgress, type FindMode } from "./picks";

beforeEach(() => setWidth(COMPUTER));
afterEach(cleanup);

const DAY = 24 * 60 * 60 * 1000;

const request = (over: Partial<PickRequest> = {}): PickRequest => ({
  status: "picking",
  wanted: 10,
  note: "Must speak Kiswahili with customers.",
  agreed: null,
  sentAt: null,
  ...over,
});

const person = (over: Partial<PickPerson> = {}): PickPerson => ({
  id: "p1",
  memberId: "m1",
  fullName: "Grace Swai",
  headline: "Bookkeeper and tax adviser",
  regionEn: "Dar es Salaam",
  regionSw: "Dar es Salaam",
  verifiedBusiness: true,
  why: "Runs a verified tax business.",
  posterView: "none",
  ...over,
});

const invite = (over: Partial<PickInvite> = {}): PickInvite => ({
  id: "k1",
  opportunityId: "o1",
  title: "Accountant, full time",
  posterName: "Kilimanjaro Coffee Traders",
  why: "Eight years of audit work.",
  status: "asked",
  answerBy: new Date(Date.now() + 3 * DAY),
  ...over,
});

const fakeApi = (over: Partial<PicksApi> = {}): PicksApi => ({
  request: vi.fn().mockResolvedValue("ok"),
  stop: vi.fn().mockResolvedValue(true),
  progress: vi.fn().mockResolvedValue(request()),
  list: vi.fn().mockResolvedValue([]),
  setView: vi.fn().mockResolvedValue(true),
  invites: vi.fn().mockResolvedValue([]),
  answer: vi.fn().mockResolvedValue("ok"),
  pickedPosts: vi.fn().mockResolvedValue(new Map()),
  ...over,
});

const show = (node: React.ReactElement) =>
  act(async () => {
    render(node);
  });

const press = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

function Form() {
  const [value, setValue] = useState<FindMode>({ mode: "open", size: undefined, note: "" });
  return <FindModeFields value={value} onChange={setValue} />;
}

describe("FindModeFields (S20)", () => {
  it("asks how many people and shows the Beta note only for Let Kingdom Connect pick", async () => {
    await show(<Form />);
    expect(
      screen.queryByRole("radiogroup", { name: "How many people should we send you?" }),
    ).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("radio", { name: "Let Kingdom Connect pick" })),
    );
    expect(
      screen.getByRole("radiogroup", { name: "How many people should we send you?" }),
    ).toBeTruthy();
    expect(screen.getByText("Beta · free for now")).toBeTruthy();
    expect(screen.getByText(/It may become paid later/)).toBeTruthy();
  });
});

describe("PickProgress (S50)", () => {
  it("shows the progress, the Beta note and the poster's note while picking", async () => {
    await show(<PickProgress api={fakeApi()} opportunityId="o1" />);
    expect(screen.getByRole("heading", { name: "Kingdom Connect is picking" })).toBeTruthy();
    expect(screen.getByText("Finding people")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("Must speak Kiswahili with customers.")).toBeTruthy();
    expect(screen.getByText(/a list already being picked stays free/)).toBeTruthy();
  });

  it("stops picking after a confirm", async () => {
    const progress = vi
      .fn()
      .mockResolvedValueOnce(request())
      .mockResolvedValue(request({ status: "stopped" }));
    const api = fakeApi({ progress });
    await show(<PickProgress api={api} opportunityId="o1" />);
    await press("Open to applicants instead");
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Open to applicants instead" })[0]!),
    );
    expect(api.stop).toHaveBeenCalledWith("o1");
    expect(screen.getByText(/The post is open to applicants/)).toBeTruthy();
  });

  it("lists the people who said yes, says when fewer agreed, and keeps Not a fit private", async () => {
    const api = fakeApi({
      progress: vi.fn().mockResolvedValue(request({ status: "sent", agreed: 1 })),
      list: vi.fn().mockResolvedValue([person()]),
    });
    await show(<PickProgress api={api} opportunityId="o1" />);
    expect(screen.getByText(/You asked for 10\. 1 agreed/)).toBeTruthy();
    expect(screen.getByText(/Fewer people agreed than you asked for/)).toBeTruthy();
    expect(screen.getByText("Runs a verified tax business.")).toBeTruthy();
    expect(screen.getByText("Verified business")).toBeTruthy();
    await press("Not a fit");
    expect(api.setView).toHaveBeenCalledWith("p1", "not_fit");
  });
});

describe("PickedInvites (S51)", () => {
  it("asks the member and records a yes", async () => {
    const invites = vi
      .fn()
      .mockResolvedValueOnce([invite()])
      .mockResolvedValue([invite({ status: "agreed" })]);
    const api = fakeApi({ invites });
    await show(<PickedInvites api={api} />);
    expect(screen.getByText(/Please answer by/)).toBeTruthy();
    expect(screen.getByText(/That you were asked, if you say no/)).toBeTruthy();
    await press("Yes, share my profile");
    expect(api.answer).toHaveBeenCalledWith("k1", true);
    expect(screen.getByText(/You said yes/)).toBeTruthy();
  });

  it("shows a lapsed ask as private, with no buttons", async () => {
    await show(
      <PickedInvites
        api={fakeApi({
          invites: vi.fn().mockResolvedValue([invite({ answerBy: new Date(Date.now() - DAY) })]),
        })}
      />,
    );
    expect(screen.getByText(/The time to answer has passed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Yes, share my profile" })).toBeNull();
  });
});

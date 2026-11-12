import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpportunityDetail } from "../lib/opportunity-browse";
import type { ResponsesApi } from "../lib/responses";
import { MyResponses, PostResponses, RespondPanel } from "./responses";

afterEach(cleanup);

const post = (over: Partial<OpportunityDetail> = {}): OpportunityDetail => ({
  id: "o1",
  type: "job",
  title: "Accountant for a coffee trader",
  role: "Accountant",
  employmentType: "full_time",
  remote: true,
  region: null,
  district: null,
  sector: { en: "Agriculture", sw: "Kilimo" },
  closingAt: "2026-11-20",
  featured: false,
  posterId: "m2",
  posterName: "Kilimanjaro Coffee Traders",
  isMine: false,
  skills: [],
  description: "Keep the books.",
  status: "published",
  readOnly: false,
  ...over,
});

const fakeApi = (over: Partial<ResponsesApi> = {}): ResponsesApi => ({
  mine: vi.fn().mockResolvedValue(null),
  respond: vi.fn().mockResolvedValue("ok"),
  withdraw: vi.fn().mockResolvedValue(true),
  myResponses: vi.fn().mockResolvedValue([]),
  forPost: vi.fn().mockResolvedValue([]),
  setStatus: vi.fn().mockResolvedValue(true),
  thread: vi.fn().mockResolvedValue("t1"),
  level: vi.fn().mockResolvedValue(1),
  fileLink: vi.fn().mockResolvedValue(null),
  pickPdf: vi.fn().mockResolvedValue(null),
  ...over,
});

const show = (node: React.ReactElement) =>
  act(async () => {
    render(node);
  });

const press = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("RespondPanel (S18)", () => {
  it("sends an application with a note and a CV, then shows it as New", async () => {
    const mine = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: "r1", status: "new" });
    const cv = { uri: "file:///cv.pdf", name: "cv.pdf", mime: "application/pdf", size: 1000 };
    const api = fakeApi({ mine, pickPdf: vi.fn().mockResolvedValue(cv) });
    await show(<RespondPanel api={api} post={post()} />);
    expect(screen.getByRole("heading", { name: "Apply for this job" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("A note to the poster (optional)"), {
      target: { value: "Five years of bookkeeping." },
    });
    await press("Add your CV (PDF)");
    expect(screen.getByText("cv.pdf")).toBeTruthy();
    await press("Send application");
    expect(api.respond).toHaveBeenCalledWith("o1", "Five years of bookkeeping.", cv);
    expect(screen.getByRole("heading", { name: "Your application" })).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("calls any other type an expression of interest", async () => {
    await show(<RespondPanel api={fakeApi()} post={post({ type: "partnership" })} />);
    expect(screen.getByRole("heading", { name: "Express interest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send interest" })).toBeTruthy();
  });

  it("refuses a file that is not a PDF of up to 5 MB", async () => {
    const big = { uri: "f", name: "big.pdf", mime: "application/pdf", size: 6 * 1024 * 1024 };
    await show(
      <RespondPanel api={fakeApi({ pickPdf: vi.fn().mockResolvedValue(big) })} post={post()} />,
    );
    await press("Add your CV (PDF)");
    expect(screen.getByText("Choose a PDF of up to 5 MB.")).toBeTruthy();
    expect(screen.queryByText("big.pdf")).toBeNull();
  });

  it("explains the server's refusal, such as contact details in the note", async () => {
    await show(
      <RespondPanel
        api={fakeApi({ respond: vi.fn().mockResolvedValue("contact_details") })}
        post={post()}
      />,
    );
    await press("Send application");
    expect(screen.getByText(/Take out the phone number or email/)).toBeTruthy();
  });

  it("asks a Level 1 member to verify their business before answering a tender", async () => {
    const api = fakeApi({ level: vi.fn().mockResolvedValue(1) });
    await show(<RespondPanel api={api} post={post({ type: "tender" })} />);
    expect(screen.getByRole("heading", { name: "Verify your business to respond" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Verify your business" }).getAttribute("href")).toBe(
      "/business",
    );
    expect(screen.queryByRole("button", { name: "Send interest" })).toBeNull();
  });

  it("withdraws while New and opens the conversation", async () => {
    const mine = vi
      .fn()
      .mockResolvedValueOnce({ id: "r1", status: "new" })
      .mockResolvedValue({ id: "r1", status: "withdrawn" });
    const api = fakeApi({ mine });
    await show(<RespondPanel api={api} post={post()} />);
    await press("Message");
    expect(api.thread).toHaveBeenCalledWith("o1", undefined);
    await press("Withdraw");
    await act(async () => {
      const buttons = screen.getAllByRole("button", { name: "Withdraw" });
      fireEvent.click(buttons[buttons.length - 1]!);
    });
    expect(api.withdraw).toHaveBeenCalledWith("r1");
    expect(screen.getByText("Withdrawn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
  });
});

describe("MyResponses (S19)", () => {
  it("lists my responses with their status", async () => {
    await show(
      <MyResponses
        api={fakeApi({
          myResponses: vi.fn().mockResolvedValue([
            {
              id: "r1",
              opportunityId: "o1",
              kind: "application",
              status: "shortlisted",
              title: "Accountant for a coffee trader",
              type: "job",
              postStatus: "published",
              sentAt: new Date("2026-11-10T09:00:00+03:00"),
            },
          ]),
        })}
      />,
    );
    expect(screen.getByText("Accountant for a coffee trader")).toBeTruthy();
    expect(screen.getByText("Job · Application · Sent 10 November 2026")).toBeTruthy();
    expect(screen.getByText("Shortlisted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("says when there is nothing yet", async () => {
    await show(<MyResponses api={fakeApi()} />);
    expect(screen.getByText("You haven't responded to anything yet")).toBeTruthy();
  });
});

describe("PostResponses (S21)", () => {
  const response = {
    id: "r1",
    memberId: "m3",
    memberName: "Neema Joseph",
    kind: "application" as const,
    note: "Five years of bookkeeping.",
    attachmentPath: "m3/cv.pdf",
    status: "new" as const,
    sentAt: new Date("2026-11-10T09:00:00+03:00"),
  };

  it("shows each response and shortlists one", async () => {
    const forPost = vi
      .fn()
      .mockResolvedValueOnce([response])
      .mockResolvedValue([{ ...response, status: "shortlisted" }]);
    const api = fakeApi({ forPost });
    await show(<PostResponses api={api} opportunityId="o1" />);
    expect(screen.getByRole("link", { name: "Neema Joseph" }).getAttribute("href")).toBe(
      "/profile/m3",
    );
    expect(screen.getByText("Five years of bookkeeping.")).toBeTruthy();
    await press("Shortlist");
    expect(api.setStatus).toHaveBeenCalledWith("r1", "shortlisted");
    expect(screen.getByText("Shortlisted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Shortlist" })).toBeNull();
  });

  it("opens the conversation with that member", async () => {
    const api = fakeApi({ forPost: vi.fn().mockResolvedValue([response]) });
    await show(<PostResponses api={api} opportunityId="o1" />);
    await press("Message");
    expect(api.thread).toHaveBeenCalledWith("o1", "m3");
  });

  it("says when the attached file cannot be opened", async () => {
    await show(
      <PostResponses
        api={fakeApi({ forPost: vi.fn().mockResolvedValue([response]) })}
        opportunityId="o1"
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("link", { name: "Open the attached PDF" })),
    );
    expect(screen.getByText("We couldn't open the file. Try again.")).toBeTruthy();
  });
});

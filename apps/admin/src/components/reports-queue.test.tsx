import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaseDetail, ReportsApi } from "@/lib/reports";
import { ModerationQueue } from "./moderation-queue";
import { ReportDetail, ReportsQueue } from "./reports-queue";

afterEach(cleanup);

const fakeApi = (over: Partial<ReportsApi> = {}): ReportsApi => ({
  queue: vi.fn().mockResolvedValue([]),
  detail: vi.fn().mockResolvedValue(null),
  startReview: vi.fn().mockResolvedValue(undefined),
  decide: vi.fn().mockResolvedValue("done"),
  liftPostingPause: vi.fn().mockResolvedValue("done"),
  reinstate: vi.fn().mockResolvedValue("done"),
  ...over,
});

const threadCase = (over: Partial<CaseDetail> = {}): CaseDetail => ({
  reportId: "r1",
  targetType: "thread",
  open: true,
  subject: {
    id: "m3",
    name: "Reported Person",
    username: "reported_person",
    headline: "Trader",
    suspended: false,
    postingPaused: false,
    upheldLastYear: 1,
  },
  reports: [
    {
      id: "r1",
      reference: "KC-2026-000010",
      reporterName: "First Reporter",
      reason: "asked_for_money",
      note: "They asked for a fee.",
      screenshotUrl: "https://files.test/shot",
      reportedAt: new Date("2026-11-03T09:00:00+03:00"),
    },
  ],
  messages: [
    {
      id: "a",
      fromSubject: true,
      senderName: "Reported Person",
      body: "Send me 50,000 first",
      deleted: false,
      sentAt: new Date("2026-11-03T08:00:00+03:00"),
      attachments: [{ id: "f", fileName: "invoice.pdf", url: "https://files.test/invoice" }],
    },
    {
      id: "b",
      fromSubject: false,
      senderName: "First Reporter",
      body: "",
      deleted: true,
      sentAt: new Date("2026-11-03T08:05:00+03:00"),
      attachments: [],
    },
  ],
  post: null,
  ...over,
});

const click = (name: string | RegExp) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function showDetail(api: ReportsApi) {
  await act(async () => {
    render(<ReportDetail id="r1" api={api} />);
  });
}

describe("ReportsQueue (A06)", () => {
  it("says when there are no open reports", async () => {
    await act(async () => {
      render(<ReportsQueue api={fakeApi()} />);
    });
    expect(screen.getByText("No open reports")).toBeTruthy();
  });

  it("lists one row per case with the reference, the target and the count", async () => {
    const api = fakeApi({
      queue: vi.fn().mockResolvedValue([
        {
          reportId: "r1",
          reference: "KC-2026-000010",
          targetType: "profile",
          subjectName: "Reported Person",
          reasons: ["harassment", "spam"],
          reportCount: 2,
          firstReportedAt: new Date("2026-11-03T09:00:00+03:00"),
          underReview: true,
        },
      ]),
    });
    await act(async () => {
      render(<ReportsQueue api={api} />);
    });
    const row = screen.getByRole("link", { name: /KC-2026-000010/ });
    expect(row.getAttribute("href")).toBe("/reports/r1");
    expect(row.textContent).toMatch(/Reported Person/);
    expect(row.textContent).toMatch(/Profile/);
    expect(row.textContent).toMatch(/Harassment, Spam/);
    expect(row.textContent).toMatch(/2 reports/);
    expect(row.textContent).toMatch(/Under review/);
  });
});

describe("ReportDetail (A07)", () => {
  it("starts the review and shows the reports, the member and the reported conversation", async () => {
    const api = fakeApi({ detail: vi.fn().mockResolvedValue(threadCase()) });
    await showDetail(api);
    expect(api.startReview).toHaveBeenCalledWith("r1");
    expect(screen.getByText(/Reported by First Reporter/)).toBeTruthy();
    expect(screen.getByText("They asked for a fee.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open screenshot" }).getAttribute("href")).toBe(
      "https://files.test/shot",
    );
    expect(screen.getByText("Upheld decisions that count toward the repeat rule: 1")).toBeTruthy();
    expect(screen.getByText("Send me 50,000 first")).toBeTruthy();
    expect(screen.getByRole("link", { name: "invoice.pdf" })).toBeTruthy();
    expect(screen.getByText("This message was deleted")).toBeTruthy();
  });

  it("shows a reported opportunity, hidden while the report is open, with its moderation item (O06)", async () => {
    const api = fakeApi({
      detail: vi.fn().mockResolvedValue(
        threadCase({
          targetType: "opportunity",
          messages: null,
          post: {
            id: "o1",
            title: "Pay a fee to join our sales team",
            description: "Send 50,000 to reserve your place.",
            status: "hidden",
          },
        }),
      ),
    });
    await showDetail(api);
    expect(screen.getByText("Opportunity")).toBeTruthy();
    expect(screen.getByText("Pay a fee to join our sales team")).toBeTruthy();
    expect(screen.getByText("Hidden from members while this report is open.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open the post's moderation item" }).getAttribute("href"),
    ).toBe("/moderation/o1");
    expect(screen.queryByText("Send me 50,000 first")).toBeNull();
  });

  it("needs a note, and a message to the member for anything but no action", async () => {
    const api = fakeApi({ detail: vi.fn().mockResolvedValue(threadCase()) });
    await showDetail(api);
    await click("Warn");
    await click("Confirm decision");
    expect(screen.getByRole("alert").textContent).toBe("Write a note.");
    type("Note for staff (required)", "Asked for a fee in chat");
    await click("Confirm decision");
    expect(screen.getByRole("alert").textContent).toBe("Write a message to the member.");
    expect(api.decide).not.toHaveBeenCalled();
    type("Message to the member (required)", "Never ask members for money.");
    await click("Confirm decision");
    expect(api.decide).toHaveBeenCalledWith(
      "r1",
      "warn",
      "Asked for a fee in chat",
      "Never ask members for money.",
    );
    expect(screen.getByText("Decision saved. Each reporter was told the outcome.")).toBeTruthy();
  });

  it("warns before the repeat rule pauses posting or suspends the account", async () => {
    const api = fakeApi({ detail: vi.fn().mockResolvedValue(threadCase()) });
    await showDetail(api);
    await click("No action");
    expect(screen.queryByText(/This decision will also/)).toBeNull();
    await click("Warn");
    expect(
      screen.getByText(
        "This decision will also pause their posting. Write the message to the member to cover it.",
      ),
    ).toBeTruthy();
    cleanup();
    await showDetail(
      fakeApi({
        detail: vi.fn().mockResolvedValue(
          threadCase({
            subject: { ...threadCase().subject, upheldLastYear: 2, postingPaused: true },
          }),
        ),
      }),
    );
    await click("Suspend posting");
    expect(
      screen.getByText(
        "This decision will also suspend their account. Write the message to the member to cover it.",
      ),
    ).toBeTruthy();
    await click("Suspend account");
    expect(screen.queryByText(/This decision will also/)).toBeNull();
  });

  it("closes with no action without a message to the member", async () => {
    const api = fakeApi({ detail: vi.fn().mockResolvedValue(threadCase()) });
    await showDetail(api);
    await click("No action");
    expect(screen.queryByLabelText("Message to the member (required)")).toBeNull();
    type("Note for staff (required)", "Normal question");
    await click("Confirm decision");
    expect(api.decide).toHaveBeenCalledWith("r1", "no_action", "Normal question", "");
  });

  it("says when another admin already decided", async () => {
    const api = fakeApi({
      detail: vi.fn().mockResolvedValue(threadCase()),
      decide: vi.fn().mockResolvedValue("already_decided"),
    });
    await showDetail(api);
    await click("No action");
    type("Note for staff (required)", "x");
    await click("Confirm decision");
    expect(screen.getByRole("alert").textContent).toBe("This report was already decided.");
  });

  it("lifts a posting pause and reinstates an account, each with a note", async () => {
    const api = fakeApi({
      detail: vi.fn().mockResolvedValue(
        threadCase({
          open: false,
          subject: { ...threadCase().subject, suspended: true, postingPaused: true },
        }),
      ),
    });
    await showDetail(api);
    expect(api.startReview).not.toHaveBeenCalled();
    expect(screen.getByText("This report is closed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm decision" })).toBeNull();
    await click("Lift posting pause");
    await click("Lift posting pause");
    expect(screen.getByRole("alert").textContent).toBe("Write a note.");
    type("Note (required)", "Agreed to stop");
    await click("Lift posting pause");
    expect(api.liftPostingPause).toHaveBeenCalledWith("m3", "Agreed to stop");
    expect(screen.getByText("Posting pause lifted.")).toBeTruthy();
    await click("Reinstate account");
    type("Note (required)", "Cleared");
    await click("Reinstate account");
    expect(api.reinstate).toHaveBeenCalledWith("m3", "Cleared");
    expect(screen.getByText("Account reinstated.")).toBeTruthy();
  });

  it("says when the report does not exist", async () => {
    await showDetail(fakeApi());
    expect(screen.getByText("This report was not found.")).toBeTruthy();
  });
});

describe("ModerationQueue (A04)", () => {
  it("is empty when nothing waits for review", async () => {
    await act(async () => {
      render(
        <ModerationQueue
          events={{ queue: vi.fn().mockResolvedValue([]), decide: vi.fn(), post: vi.fn() }}
          training={{ queue: vi.fn().mockResolvedValue([]), decide: vi.fn(), post: vi.fn() }}
          ideas={{ queue: vi.fn().mockResolvedValue([]), decide: vi.fn() }}
        />,
      );
    });
    expect(screen.getByText("Nothing to review")).toBeTruthy();
  });
});

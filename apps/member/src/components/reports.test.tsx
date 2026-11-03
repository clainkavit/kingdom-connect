import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsApi } from "../lib/connections";
import type { ReportsApi } from "../lib/reports";
import { MyReports, ReportForm } from "./reports";

afterEach(cleanup);

const fakeApi = (over: Partial<ReportsApi> = {}): ReportsApi => ({
  send: vi.fn().mockResolvedValue({ kind: "sent", reference: "KC-2026-000123" }),
  mine: vi.fn().mockResolvedValue([]),
  pickScreenshot: vi.fn().mockResolvedValue(null),
  ...over,
});

const connections = { block: vi.fn().mockResolvedValue(true) } as unknown as ConnectionsApi;

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

const pick = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("option", { name })));

async function showForm(api: ReportsApi) {
  await act(async () => {
    render(
      <ReportForm
        api={api}
        target={{ type: "thread", id: "t1" }}
        memberId="m2"
        connections={connections}
      />,
    );
  });
}

describe("ReportForm (S42)", () => {
  it("needs a reason, then sends it with the note and shows the reference", async () => {
    const api = fakeApi();
    await showForm(api);
    await click("Send report");
    expect(screen.getByRole("alert").textContent).toBe("Choose a reason.");
    expect(api.send).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Why are you reporting\?/ })),
    );
    await pick("Asked for money");
    fireEvent.change(screen.getByLabelText("Anything else we should know (optional)"), {
      target: { value: "They asked for a fee." },
    });
    await click("Send report");
    expect(api.send).toHaveBeenCalledWith(
      { type: "thread", id: "t1" },
      "asked_for_money",
      "They asked for a fee.",
      null,
    );
    expect(screen.getByText("Your reference: KC-2026-000123")).toBeTruthy();
  });

  it("refuses a screenshot over 5 MB before sending", async () => {
    await showForm(
      fakeApi({
        pickScreenshot: vi
          .fn()
          .mockResolvedValue({ uri: "x", mime: "image/png", size: 6 * 1024 * 1024 }),
      }),
    );
    await click("Add a screenshot (optional)");
    expect(screen.getByRole("alert").textContent).toBe("The screenshot can be up to 5 MB.");
  });

  it("shows the open report on a repeat, and offers to block", async () => {
    await showForm(
      fakeApi({
        send: vi.fn().mockResolvedValue({ kind: "already_reported", reference: "KC-2026-000007" }),
      }),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Why are you reporting\?/ })),
    );
    await pick("Spam");
    await click("Send report");
    expect(screen.getByText("You already reported this. It is being reviewed.")).toBeTruthy();
    expect(screen.getByText("Your reference: KC-2026-000007")).toBeTruthy();
    await click("Block this member");
    await click("Yes, block");
    expect(connections.block).toHaveBeenCalledWith("m2");
    expect(screen.getByText("You blocked this member.")).toBeTruthy();
  });
});

describe("MyReports (S43)", () => {
  it("shows each reference with its outcome only", async () => {
    const api = fakeApi({
      mine: vi.fn().mockResolvedValue([
        {
          reference: "KC-2026-000002",
          outcome: "action_taken",
          reportedAt: "2026-11-02T10:00:00Z",
        },
        { reference: "KC-2026-000001", outcome: "open", reportedAt: "2026-11-01T10:00:00Z" },
      ]),
    });
    await act(async () => {
      render(<MyReports api={api} />);
    });
    expect(screen.getByText("KC-2026-000002")).toBeTruthy();
    expect(screen.getByText("Action taken")).toBeTruthy();
    expect(screen.getByText("Being reviewed")).toBeTruthy();
  });

  it("says when there are no reports", async () => {
    await act(async () => {
      render(<MyReports api={fakeApi()} />);
    });
    expect(screen.getByText("You haven't reported anything")).toBeTruthy();
  });
});

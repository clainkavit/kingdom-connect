import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueueItem, VerificationApi } from "@/lib/verification";
import { VerificationQueue } from "./verification-queue";

afterEach(cleanup);

const eat = (local: string) => new Date(`${local}+03:00`);
const now = () => eat("2026-11-10T12:00");

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: "r1",
  submittedAt: eat("2026-11-10T09:00"),
  username: "test_applicant",
  fullName: "Test Applicant",
  suspectedDuplicate: false,
  ...over,
});

const api = (queue: VerificationApi["queue"]) => ({ queue }) as unknown as VerificationApi;

async function show(queue: VerificationApi["queue"]) {
  await act(async () => {
    render(<VerificationQueue api={api(queue)} now={now} />);
  });
}

describe("VerificationQueue (A02)", () => {
  it("says when nothing is waiting", async () => {
    await show(vi.fn().mockResolvedValue([]));
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
  });

  it("lists applications oldest first with the queue size and the oldest age", async () => {
    await show(
      vi
        .fn()
        .mockResolvedValue([
          item({ id: "old", username: "first_in", submittedAt: eat("2026-11-07T09:00") }),
          item({ id: "new", username: "second_in" }),
        ]),
    );
    expect(screen.getByText("2 waiting")).toBeTruthy();
    expect(screen.getByText("Oldest: 3 days")).toBeTruthy();
    const links = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"))
      .filter((href) => href?.startsWith("/verification/"));
    expect(links).toEqual(["/verification/old", "/verification/new"]);
  });

  it("warns about applications that waited 2 working days", async () => {
    await show(
      vi
        .fn()
        .mockResolvedValue([
          item({ id: "late", submittedAt: eat("2026-11-06T16:00") }),
          item({ id: "fresh" }),
        ]),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "1 application has waited 2 working days or more. Review it first.",
    );
    expect(screen.getAllByText("Waiting 2+ working days")).toHaveLength(1);
  });

  it("marks a suspected duplicate", async () => {
    await show(vi.fn().mockResolvedValue([item({ suspectedDuplicate: true })]));
    expect(screen.getByText("Suspected duplicate")).toBeTruthy();
  });

  it("offers a retry when the queue cannot load", async () => {
    const queue = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    await show(queue);
    expect(screen.getByText(/couldn't load the queue/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
  });
});

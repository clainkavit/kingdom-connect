import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationStatus } from "./registration-status";

afterEach(cleanup);

describe("RegistrationStatus (S06)", () => {
  it("says the application is under review, with no expected time (#180)", () => {
    render(<RegistrationStatus status={{ kind: "under_review" }} onResubmit={vi.fn()} />);
    expect(screen.getByText("Under review")).toBeTruthy();
    expect(
      screen.getByText(
        "Your application is being reviewed. You will get a notification when the review is done.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/working day/)).toBeNull();
  });

  it("shows the reason after a first rejection and lets the applicant fix and resubmit", async () => {
    const onResubmit = vi.fn().mockResolvedValue(true);
    render(
      <RegistrationStatus
        status={{ kind: "rejected", reason: "The ID has expired", final: false }}
        onResubmit={onResubmit}
      />,
    );
    expect(screen.getByText("Reason: The ID has expired")).toBeTruthy();
    expect(screen.getByText("You can fix this and send it again once.")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Fix and resubmit" })),
    );
    expect(onResubmit).toHaveBeenCalled();
  });

  it("says when reopening failed", async () => {
    render(
      <RegistrationStatus
        status={{ kind: "rejected", reason: "R", final: false }}
        onResubmit={vi.fn().mockResolvedValue(false)}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Fix and resubmit" })),
    );
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't reopen your application/);
  });

  it("shows a final rejection with no way to resubmit", () => {
    render(
      <RegistrationStatus
        status={{ kind: "rejected", reason: "The face photo does not match", final: true }}
        onResubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("Reason: The face photo does not match")).toBeTruthy();
    expect(
      screen.getByText("This decision is final unless an administrator reopens it."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fix and resubmit" })).toBeNull();
  });
});

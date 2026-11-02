import { describe, expect, it } from "vitest";
import { planDelivery } from "./outbox.ts";

const member = { language: "en" as const, emailSwitchedOn: true };

describe("planDelivery (F10)", () => {
  it("sends a connection request in the member's language", () => {
    const plan = planDelivery(
      { kind: "C1", payload: { name: "Neema S." } },
      { ...member, language: "sw" },
      "Test Platform",
    );
    expect(plan).toMatchObject({
      action: "send",
      email: { subject: "Ombi jipya la kuunganishwa" },
    });
  });

  it("skips a non-critical email the member switched off", () => {
    expect(
      planDelivery({ kind: "C1", payload: {} }, { ...member, emailSwitchedOn: false }, "P"),
    ).toEqual({
      action: "skip",
    });
  });

  it("always sends a critical email, even when switched off", () => {
    const plan = planDelivery(
      { kind: "X1", payload: { reason: "Test" } },
      { ...member, emailSwitchedOn: false },
      "P",
    );
    expect(plan.action).toBe("send");
  });

  it("never emails an in-app-only event", () => {
    expect(planDelivery({ kind: "R1", payload: {} }, member, "P")).toEqual({ action: "skip" });
  });

  it("holds single messages for the daily digest, then sends the digest", () => {
    expect(planDelivery({ kind: "C3", payload: { name: "X" } }, member, "P")).toEqual({
      action: "skip",
    });
    const digest = planDelivery(
      { kind: "C3", payload: { digest: true, count: 3 } },
      member,
      "Test Platform",
    );
    expect(digest).toMatchObject({
      action: "send",
      email: { subject: "You have 3 new messages on Test Platform." },
    });
  });

  it("holds weekly matches for the weekly digest", () => {
    expect(planDelivery({ kind: "S1", payload: { count: 2 } }, member, "P")).toEqual({
      action: "skip",
    });
  });

  it("fails an unknown kind instead of sending", () => {
    expect(planDelivery({ kind: "Z9", payload: {} }, member, "P").action).toBe("fail");
  });
});

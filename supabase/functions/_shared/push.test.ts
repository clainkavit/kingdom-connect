import { describe, expect, it } from "vitest";
import { notificationCopy, type NotificationCopy } from "./notifications.ts";
import { deadTokens, planPush, type PushMessage } from "./push.ts";

const on = {
  language: "en" as const,
  masterOn: true,
  categoryOn: true,
  tokens: ["ExponentPushToken[abcdefghij0123]"],
};

const pushKinds = Object.entries(notificationCopy as Record<string, NotificationCopy>)
  .filter(([, copy]) => copy.push)
  .map(([kind]) => kind);

describe("planPush (M03)", () => {
  it("pushes a connection request in the member's language", () => {
    const plan = planPush(
      { kind: "C1", payload: { name: "Neema S." } },
      { ...on, language: "sw" },
      "Test Platform",
    );
    expect(plan.action).toBe("send");
    if (plan.action === "send") {
      expect(plan.messages).toHaveLength(1);
      expect(`${plan.messages[0].title} ${plan.messages[0].body}`).toContain("Neema S.");
      expect(plan.messages[0].body).toMatch(/ombi|unganish/i);
      expect(plan.messages[0].data.opens).toBe("/connections");
    }
  });

  it("says only that there is a new message, with no sender and no preview", () => {
    const plan = planPush(
      { kind: "C3", payload: { name: "Neema S.", preview: "secret words" } },
      on,
      "Test Platform",
    );
    expect(plan.action).toBe("send");
    if (plan.action === "send") {
      expect(plan.messages[0].body).toBe("You have a new message.");
      expect(JSON.stringify(plan.messages[0])).not.toContain("secret words");
    }
  });

  it("sends to every phone the member has", () => {
    const plan = planPush(
      { kind: "C1", payload: { name: "Neema S." } },
      {
        ...on,
        tokens: ["ExponentPushToken[abcdefghij0123]", "ExponentPushToken[klmnopqrst4567]"],
      },
      "Test Platform",
    );
    expect(plan.action === "send" && plan.messages.map((m) => m.to)).toEqual([
      "ExponentPushToken[abcdefghij0123]",
      "ExponentPushToken[klmnopqrst4567]",
    ]);
  });

  it("skips a kind the catalogue does not push", () => {
    expect(planPush({ kind: "R1", payload: {} }, on, "Test Platform").action).toBe("skip");
  });

  it("never pushes an anonymous interest in an idea", () => {
    const plan = planPush(
      { kind: "I2", payload: { idea_title: "Solar dryers", band: "TZS 10M to 50M" } },
      on,
      "Test Platform",
    );
    expect(plan.action).toBe("skip");
  });

  it("skips when the master switch or the category is off, or there is no phone", () => {
    const row = { kind: "C1", payload: { name: "Neema S." } };
    expect(planPush(row, { ...on, masterOn: false }, "P").action).toBe("skip");
    expect(planPush(row, { ...on, categoryOn: false }, "P").action).toBe("skip");
    expect(planPush(row, { ...on, tokens: [] }, "P").action).toBe("skip");
  });

  it("fails an unknown kind", () => {
    expect(planPush({ kind: "Z9", payload: {} }, on, "P").action).toBe("fail");
  });

  it("builds a readable push for every kind that pushes, with no contact details and no leftover placeholder", () => {
    const sample = {
      name: "Neema S.",
      title: "Cold rooms",
      item: "Cold rooms",
      idea_title: "Solar dryers",
      reason: "Too short",
      platform_name: "Test Platform",
      count: 3,
    };
    expect(pushKinds.length).toBeGreaterThan(5);
    for (const kind of pushKinds) {
      for (const language of ["en", "sw"] as const) {
        const plan = planPush({ kind, payload: sample }, { ...on, language }, "Test Platform");
        expect(plan.action, kind).toBe("send");
        if (plan.action !== "send") continue;
        const text = `${plan.messages[0].title} ${plan.messages[0].body}`;
        expect(text, kind).not.toMatch(/\{\w+\}/);
        expect(text, kind).not.toMatch(/@/);
        expect(text, kind).not.toMatch(/\+?255[ -]?\d|\b0[67]\d{2}[ -]?\d{3}/);
        expect(plan.messages[0].body.length, kind).toBeGreaterThan(0);
      }
    }
  });
});

describe("deadTokens (M03)", () => {
  const messages = [
    { to: "ExponentPushToken[aaaaaaaaaa1]" },
    { to: "ExponentPushToken[bbbbbbbbbb2]" },
    { to: "ExponentPushToken[cccccccccc3]" },
  ] as PushMessage[];

  it("returns only the tokens Expo says no longer belong to a phone", () => {
    expect(
      deadTokens(messages, [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "error", details: { error: "MessageRateExceeded" } },
      ]),
    ).toEqual(["ExponentPushToken[bbbbbbbbbb2]"]);
  });
});

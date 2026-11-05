import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { notificationFiles, notificationPaths } from "../../scripts/notification-files";
import {
  criticalCategories,
  emailSwitchCategories,
  emailWanted,
  fillTemplate,
  notificationCopy,
  notificationText,
  opensForCode,
} from "./index";
import { parseNotificationDoc } from "./parse";

const doc = readFileSync(notificationPaths.doc, "utf8");

describe("the catalogue", () => {
  it("is generated from docs/notifications.md and matches it (pnpm notifications)", async () => {
    for (const file of await notificationFiles()) {
      expect(readFileSync(file.path, "utf8").replace(/\r\n/g, "\n"), file.path).toBe(
        file.content.replace(/\r\n/g, "\n"),
      );
    }
  });

  it("holds every event in the doc", () => {
    const codes = [...doc.matchAll(/^### (\w+) /gm)].map((m) => m[1]);
    expect(Object.keys(notificationCopy)).toEqual(codes);
    expect(codes).toHaveLength(57);
  });

  it("reads the channels from each event", () => {
    expect(notificationCopy.A5).toMatchObject({ inApp: false, email: "yes" });
    expect(notificationCopy.C3).toMatchObject({ inApp: true, email: "digest", push: true });
    expect(notificationCopy.S1).toMatchObject({ email: "weekly" });
    expect(notificationCopy.R1).toMatchObject({ inApp: true, email: "no" });
  });

  it("uses only the placeholders the doc lists", () => {
    const listed = new Set([...doc.matchAll(/`\{(\w+)\}`/g)].map((m) => m[1]));
    for (const [code, copy] of Object.entries(notificationCopy)) {
      for (const text of [copy.en, copy.sw]) {
        for (const value of Object.values(text)) {
          for (const [, key] of String(value).matchAll(/\{(\w+)\}/g))
            expect(listed.has(key), `${code} uses {${key}}`).toBe(true);
        }
      }
    }
  });

  it("refuses an event it cannot read", () => {
    expect(() =>
      parseNotificationDoc("### Z9 Odd\nTo: x. Channels: in-app.\n- **EN** hello\n"),
    ).toThrow();
  });
});

describe("categories", () => {
  it("always email account, security and admin actions", () => {
    expect(criticalCategories).toEqual(["account", "security", "admin_actions"]);
    expect(notificationCopy.X2.category).toBe("admin_actions");
    expect(notificationCopy.X3.category).toBe("admin_actions");
    expect(notificationCopy.H1.category).toBe("admin_actions");
    expect(notificationCopy.L1.category).toBe("security");
    expect(notificationCopy.E1.category).toBe("security");
  });

  it("open the dashboard for a warning", () => {
    expect(opensForCode("X3")).toBe("/");
  });

  it("give a switch to every other category that sends email", () => {
    expect(emailSwitchCategories).not.toContain("account");
    expect(emailSwitchCategories).not.toContain("reports");
    expect(emailSwitchCategories).toContain("connections");
    expect(emailSwitchCategories).toContain("messages");
  });
});

describe("emailWanted", () => {
  it("sends a critical email even when switched off", () => {
    expect(emailWanted(notificationCopy.X1, false)).toBe(true);
  });

  it("follows the member's switch for other categories", () => {
    expect(emailWanted(notificationCopy.C1, false)).toBe(false);
    expect(emailWanted(notificationCopy.C1, true)).toBe(true);
  });

  it("never emails an in-app-only event", () => {
    expect(emailWanted(notificationCopy.R1, true)).toBe(false);
  });
});

describe("text", () => {
  it("fills placeholders in each language", () => {
    const values = { platform_name: "Test Platform", name: "Neema S." };
    expect(notificationText(notificationCopy.C1, "en", values).message).toContain("Neema S.");
    expect(notificationText(notificationCopy.A2, "sw", values).title).toBe("Karibu Test Platform");
  });

  it("leaves a missing value visible", () => {
    expect(fillTemplate("Hello {name}", {})).toBe("Hello {name}");
  });
});

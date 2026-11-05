import { describe, expect, it } from "vitest";
import { scrubEvent } from "./monitoring";

describe("scrubEvent (PRD section 15, monitoring)", () => {
  it("keeps the error and drops the user, request details and query strings", () => {
    const event = scrubEvent({
      message: "Cannot read properties of undefined",
      user: { id: "m1", email: "member@example.test" },
      request: {
        url: "https://app.example.test/profile/m2?tab=contact",
        headers: { Authorization: "Bearer secret" },
        cookies: { sb: "token" },
        data: { phone: "+255712345678" },
        query_string: "tab=contact",
      },
      breadcrumbs: [
        {
          category: "fetch",
          data: { url: "https://db.example.test/rest/v1/member_private?select=phone", body: "x" },
        },
        { category: "navigation", data: { from: "/login?next=/messages", to: "/messages/t1?x=1" } },
        { category: "console", message: "+255712345678" },
      ],
    });
    expect(event).toEqual({
      message: "Cannot read properties of undefined",
      request: { url: "https://app.example.test/profile/m2" },
      breadcrumbs: [
        { category: "fetch", data: { url: "https://db.example.test/rest/v1/member_private" } },
        { category: "navigation", data: { from: "/login", to: "/messages/t1" } },
      ],
    });
  });

  it("blanks out contact details and ids in messages, errors, breadcrumbs and paths", () => {
    const event = scrubEvent({
      message: "Failed for member@example.test",
      exception: { values: [{ type: "Error", value: "duplicate phone +255 712 345 678" }] },
      extra: { profile: { phone: "+255712345678" } },
      contexts: { browser: { name: "Chrome" }, state: { phone: "+255712345678" } },
      request: { url: "https://app.example.test/profile/0f8fad5b-d9cb-469f-a165-70867728950e" },
      breadcrumbs: [
        { category: "ui.click", message: "button[aria-label=Message Asha] 0712345678" },
      ],
    });
    expect(event).toEqual({
      message: "Failed for [redacted]",
      exception: { values: [{ type: "Error", value: "duplicate phone [redacted]" }] },
      contexts: { browser: { name: "Chrome" } },
      request: { url: "https://app.example.test/profile/[redacted]" },
      breadcrumbs: [
        { category: "ui.click", message: "button[aria-label=Message Asha] [redacted]" },
      ],
    });
  });

  it("leaves an event without those parts alone", () => {
    expect(scrubEvent({ message: "x" })).toEqual({ message: "x" });
  });
});

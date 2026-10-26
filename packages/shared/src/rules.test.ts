import { describe, expect, it } from "vitest";
import {
  canRespondToTender,
  canSendConnectionRequest,
  DAILY_CONNECTION_REQUEST_LIMIT,
} from "./rules";

describe("canRespondToTender", () => {
  it("is false for a Level 1 member", () => {
    expect(canRespondToTender(1)).toBe(false);
  });

  it("is true for Level 2 and Level 3", () => {
    expect(canRespondToTender(2)).toBe(true);
    expect(canRespondToTender(3)).toBe(true);
  });
});

describe("canSendConnectionRequest", () => {
  it("allows requests up to the daily limit", () => {
    expect(canSendConnectionRequest(0)).toBe(true);
    expect(canSendConnectionRequest(DAILY_CONNECTION_REQUEST_LIMIT - 1)).toBe(true);
  });

  it("refuses the 31st request in a day", () => {
    expect(canSendConnectionRequest(DAILY_CONNECTION_REQUEST_LIMIT)).toBe(false);
  });
});

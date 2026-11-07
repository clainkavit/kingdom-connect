import { vi } from "vitest";
import type { IdeaAccessApi } from "../lib/idea-access";

/** A test double for the I03 access calls: no request yet, not an investor, nothing viewed. */
export const fakeAccess = (over: Partial<IdeaAccessApi> = {}): IdeaAccessApi => ({
  isInvestor: vi.fn().mockResolvedValue(false),
  myRequest: vi.fn().mockResolvedValue(null),
  express: vi.fn().mockResolvedValue("ok"),
  recordView: vi.fn().mockResolvedValue(undefined),
  requests: vi.fn().mockResolvedValue([]),
  viewCount: vi.fn().mockResolvedValue(0),
  decide: vi.fn().mockResolvedValue("ok"),
  revoke: vi.fn().mockResolvedValue("ok"),
  ...over,
});

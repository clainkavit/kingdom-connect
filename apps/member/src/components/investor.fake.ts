import { vi } from "vitest";
import type { InvestorApi } from "../lib/investor";

/** A test double for the I06 calls: a member without investor tools. */
export const fakeInvestor = (over: Partial<InvestorApi> = {}): InvestorApi => ({
  status: vi.fn().mockResolvedValue("none"),
  apply: vi.fn().mockResolvedValue("ok"),
  pool: vi.fn().mockResolvedValue([]),
  setSaved: vi.fn().mockResolvedValue("ok"),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Arusha" }]),
  ...over,
});

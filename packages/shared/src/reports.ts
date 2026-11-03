import type { TextKey } from "./strings";

export const REPORT_REASONS = [
  "asked_for_money",
  "fake_job_or_business",
  "harassment",
  "impersonation",
  "spam",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportReasonLabel: Record<ReportReason, TextKey> = {
  asked_for_money: "reasonAskedForMoney",
  fake_job_or_business: "reasonFakeJobOrBusiness",
  harassment: "reasonHarassment",
  impersonation: "reasonImpersonation",
  spam: "reasonSpam",
  other: "reasonOther",
};

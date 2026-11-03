import { supabase } from "./supabase";

export const REPORT_REASONS = [
  "asked_for_money",
  "fake_job_or_business",
  "harassment",
  "impersonation",
  "spam",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const MAX_REPORT_NOTE = 1000;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ReportTarget = { type: "profile" | "thread"; id: string };

export type Screenshot = { uri: string; mime: string; size: number };

/** Builds the S42 address for reporting an item, with the member the success screen offers to block. */
export const reportHref = (target: ReportTarget, memberId: string) =>
  `/report?type=${target.type}&id=${target.id}&member=${memberId}`;

export type ReportResult =
  | { kind: "sent" | "already_reported"; reference: string }
  | { kind: "screenshot_too_large" | "screenshot_wrong_type" | "failed" };

export type MyReport = {
  reference: string;
  outcome: "open" | "action_taken" | "no_action";
  reportedAt: string;
};

export type ReportsApi = {
  send: (
    target: ReportTarget,
    reason: ReportReason,
    note: string,
    screenshot: Screenshot | null,
  ) => Promise<ReportResult>;
  mine: () => Promise<MyReport[]>;
  pickScreenshot: () => Promise<Screenshot | null>;
};

export function screenshotProblem(shot: Screenshot) {
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(shot.mime))
    return "screenshot_wrong_type" as const;
  if (shot.size > MAX_SCREENSHOT_BYTES) return "screenshot_too_large" as const;
  return null;
}

export function reportsApi(pick: () => Promise<Screenshot | null>): ReportsApi {
  return {
    async send(target, reason, note, screenshot) {
      let path: string | null = null;
      if (screenshot) {
        const problem = screenshotProblem(screenshot);
        if (problem) return { kind: problem };
        const { data } = await supabase.auth.getSession();
        const extension = screenshot.mime.split("/")[1] ?? "png";
        path = `${data.session?.user.id ?? ""}/${crypto.randomUUID()}.${extension}`;
        const blob = await (await fetch(screenshot.uri)).blob();
        const upload = await supabase.storage
          .from("report-files")
          .upload(path, blob, { contentType: screenshot.mime });
        if (upload.error) return { kind: "failed" };
      }
      const { data, error } = await supabase.rpc("report", {
        target_type: target.type,
        target_id: target.id,
        reason,
        note: note.trim() || null,
        screenshot_path: path,
      });
      const row = (data as { reference_no: string; already_reported: boolean }[] | null)?.[0];
      if (path && (error || !row || row.already_reported))
        await supabase.storage.from("report-files").remove([path]);
      if (error || !row) return { kind: "failed" };
      return {
        kind: row.already_reported ? "already_reported" : "sent",
        reference: row.reference_no,
      };
    },

    async mine() {
      const { data, error } = await supabase.rpc("my_reports");
      if (error) throw error;
      return (
        (data ?? []) as {
          reference_no: string;
          outcome: MyReport["outcome"];
          reported_at: string;
        }[]
      ).map((r) => ({ reference: r.reference_no, outcome: r.outcome, reportedAt: r.reported_at }));
    },

    pickScreenshot: pick,
  };
}

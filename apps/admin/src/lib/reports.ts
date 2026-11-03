import type { ReportReason } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type CaseSummary = {
  reportId: string;
  reference: string;
  targetType: "profile" | "thread";
  subjectName: string;
  reasons: ReportReason[];
  reportCount: number;
  firstReportedAt: Date;
  underReview: boolean;
};

export type CaseReport = {
  id: string;
  reference: string;
  reporterName: string;
  reason: ReportReason;
  note: string | null;
  screenshotUrl: string | null;
  reportedAt: Date;
};

export type CaseMessage = {
  id: string;
  fromSubject: boolean;
  senderName: string;
  body: string;
  deleted: boolean;
  sentAt: Date;
  attachments: { id: string; fileName: string; url: string | null }[];
};

export type Subject = {
  id: string;
  name: string;
  username: string;
  headline: string;
  suspended: boolean;
  postingPaused: boolean;
  upheldLastYear: number;
};

export type CaseDetail = {
  reportId: string;
  targetType: "profile" | "thread";
  open: boolean;
  subject: Subject;
  reports: CaseReport[];
  messages: CaseMessage[] | null;
};

export type ModerationAction = "no_action" | "warn" | "suspend_posting" | "suspend_account";

/** The step the repeat rule adds to this decision (PRD section 13, criterion 5), as decide_report() applies it. */
export function automaticStep(
  subject: Subject,
  action: ModerationAction,
): "pause" | "suspend" | null {
  if (action === "no_action" || action === "suspend_account" || subject.suspended) return null;
  const upheld = subject.upheldLastYear + 1;
  if (upheld >= 3) return "suspend";
  if (upheld === 2 && !subject.postingPaused && action !== "suspend_posting") return "pause";
  return null;
}

export type ActionResult =
  | "done"
  | "note_required"
  | "message_required"
  | "already_decided"
  | "not_paused"
  | "not_suspended"
  | "failed";

export type ReportsApi = {
  queue: () => Promise<CaseSummary[]>;
  detail: (reportId: string) => Promise<CaseDetail | null>;
  startReview: (reportId: string) => Promise<void>;
  decide: (
    reportId: string,
    action: ModerationAction,
    note: string,
    memberMessage: string,
  ) => Promise<ActionResult>;
  liftPostingPause: (memberId: string, note: string) => Promise<ActionResult>;
  reinstate: (memberId: string, note: string) => Promise<ActionResult>;
};

const LINK_SECONDS = 300;

const refusals: ActionResult[] = [
  "note_required",
  "message_required",
  "already_decided",
  "not_paused",
  "not_suspended",
];

const resultOf = (error: { message: string } | null): ActionResult =>
  !error ? "done" : (refusals.find((r) => r === error.message) ?? "failed");

async function signedLinks(bucket: string, paths: string[]) {
  if (paths.length === 0) return new Map<string, string>();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, LINK_SECONDS);
  return new Map(
    (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])),
  );
}

type Person = { username: string; profile: { full_name: string } | null } | null;
const nameOf = (p: Person) => p?.profile?.full_name || p?.username || "";

export const reportsApi: ReportsApi = {
  async queue() {
    const { data, error } = await supabase.rpc("report_queue");
    if (error) throw error;
    return (
      data as {
        report_id: string;
        reference_no: string;
        target_type: "profile" | "thread";
        subject_name: string;
        reasons: ReportReason[];
        report_count: number;
        first_reported_at: string;
        status: string;
      }[]
    ).map((r) => ({
      reportId: r.report_id,
      reference: r.reference_no,
      targetType: r.target_type,
      subjectName: r.subject_name,
      reasons: r.reasons,
      reportCount: r.report_count,
      firstReportedAt: new Date(r.first_reported_at),
      underReview: r.status === "under_review",
    }));
  },

  async detail(reportId) {
    const { data: picked, error } = await supabase
      .from("reports")
      .select("id, target_type, target_id, subject_id, status")
      .eq("id", reportId)
      .maybeSingle();
    if (error) throw error;
    if (!picked) return null;
    const open = picked.status === "open" || picked.status === "under_review";

    let reportsQuery = supabase
      .from("reports")
      .select(
        "id, reference_no, reason, note, screenshot_path, created_at, reporter:members!reports_reporter_id_fkey(username, profile:profiles(full_name))",
      )
      .eq("target_type", picked.target_type)
      .eq("target_id", picked.target_id)
      .eq("subject_id", picked.subject_id)
      .order("created_at");
    reportsQuery = open
      ? reportsQuery.in("status", ["open", "under_review"])
      : reportsQuery.eq("id", reportId);

    const [reportRows, subjectRow, upheld] = await Promise.all([
      reportsQuery,
      supabase
        .from("members")
        .select(
          "id, username, status, posting_suspended_until, profile:profiles(full_name, headline)",
        )
        .eq("id", picked.subject_id)
        .single(),
      supabase.rpc("upheld_decisions", { member: picked.subject_id }),
    ]);
    if (reportRows.error) throw reportRows.error;
    if (subjectRow.error) throw subjectRow.error;

    const rows = reportRows.data as unknown as {
      id: string;
      reference_no: string;
      reason: ReportReason;
      note: string | null;
      screenshot_path: string | null;
      created_at: string;
      reporter: Person;
    }[];
    const shots = await signedLinks(
      "report-files",
      rows.flatMap((r) => (r.screenshot_path ? [r.screenshot_path] : [])),
    );

    const member = subjectRow.data as unknown as {
      id: string;
      username: string;
      status: string;
      posting_suspended_until: string | null;
      profile: { full_name: string; headline: string | null } | null;
    };

    let messages: CaseMessage[] | null = null;
    if (picked.target_type === "thread") {
      const { data: messageRows, error: messageError } = await supabase
        .from("messages")
        .select(
          "id, sender_id, body, deleted_at, created_at, sender:members!messages_sender_id_fkey(username, profile:profiles(full_name)), attachments:message_attachments(id, file_name, storage_path)",
        )
        .eq("thread_id", picked.target_id)
        .order("created_at");
      if (messageError) throw messageError;
      const list = messageRows as unknown as {
        id: string;
        sender_id: string;
        body: string;
        deleted_at: string | null;
        created_at: string;
        sender: Person;
        attachments: { id: string; file_name: string; storage_path: string }[];
      }[];
      const files = await signedLinks(
        "message-files",
        list.flatMap((m) => m.attachments.map((a) => a.storage_path)),
      );
      messages = list.map((m) => ({
        id: m.id,
        fromSubject: m.sender_id === picked.subject_id,
        senderName: nameOf(m.sender),
        body: m.body,
        deleted: m.deleted_at !== null,
        sentAt: new Date(m.created_at),
        attachments: m.attachments.map((a) => ({
          id: a.id,
          fileName: a.file_name,
          url: files.get(a.storage_path) ?? null,
        })),
      }));
    }

    return {
      reportId,
      targetType: picked.target_type as "profile" | "thread",
      open,
      subject: {
        id: member.id,
        name: member.profile?.full_name || member.username,
        username: member.username,
        headline: member.profile?.headline ?? "",
        suspended: member.status === "suspended",
        postingPaused:
          member.posting_suspended_until !== null &&
          new Date(member.posting_suspended_until) > new Date(),
        upheldLastYear: (upheld.data as number | null) ?? 0,
      },
      reports: rows.map((r) => ({
        id: r.id,
        reference: r.reference_no,
        reporterName: nameOf(r.reporter),
        reason: r.reason,
        note: r.note,
        screenshotUrl: (r.screenshot_path && shots.get(r.screenshot_path)) || null,
        reportedAt: new Date(r.created_at),
      })),
      messages,
    };
  },

  async startReview(reportId) {
    const { error } = await supabase.rpc("start_review", { report: reportId });
    if (error) throw error;
  },

  async decide(reportId, action, note, memberMessage) {
    const { error } = await supabase.rpc("decide_report", {
      report: reportId,
      action,
      note,
      member_message: memberMessage.trim() || null,
    });
    return resultOf(error);
  },

  async liftPostingPause(memberId, note) {
    const { error } = await supabase.rpc("lift_posting_pause", { member: memberId, note });
    return resultOf(error);
  },

  async reinstate(memberId, note) {
    const { error } = await supabase.rpc("reinstate_account", { member: memberId, note });
    return resultOf(error);
  },
};

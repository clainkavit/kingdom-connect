import type { PendingText } from "./legal";
import { supabase } from "./supabase";

export type PlanStatus = "pending" | "active" | "completed" | "lapsed" | "withdrawn" | "ended";

export type PlanSummary = {
  id: string;
  status: PlanStatus;
  otherId: string;
  otherName: string;
  itemTitle: string;
  ideaId: string | null;
  startedByMe: boolean;
  milestones: number;
  confirmed: number;
  expiresAt: string;
  stage1AgreedAt: string | null;
};

export type Milestone = {
  id: string;
  position: number;
  title: string;
  description: string;
  targetDate: string | null;
  responsibleIsMe: boolean;
  status: "open" | "done" | "confirmed";
};

export type Plan = PlanSummary & {
  milestoneList: Milestone[];
  /** Who withdrew or ended it, when and why (P02). */
  closedByMe: boolean | null;
  closedAt: string | null;
  endedReason: string | null;
};

export type PlanPartner = { ideaId: string; ideaTitle: string; otherId: string; otherName: string };

export type StepDraft = {
  title: string;
  description: string;
  targetDate: string;
  responsible: "me" | "other";
};

export type PlanDocument = { mine: boolean; storagePath: string; uploadedAt: string };
export type PickedPdf = { uri: string; name: string; mime: string; size: number };
export const PLAN_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type PlansApi = {
  mine: () => Promise<PlanSummary[]>;
  load: (planId: string) => Promise<Plan | null>;
  partners: () => Promise<PlanPartner[]>;
  handoff: () => Promise<PendingText | null>;
  propose: (
    ideaId: string,
    otherId: string,
    steps: StepDraft[],
    handoffId: string,
  ) => Promise<{ result: string; planId: string | null }>;
  restart: (
    planId: string,
    handoffId: string,
  ) => Promise<{ result: string; planId: string | null }>;
  accept: (planId: string, handoffId: string) => Promise<string>;
  withdraw: (planId: string) => Promise<string>;
  markDone: (milestoneId: string) => Promise<string>;
  confirm: (milestoneId: string) => Promise<string>;
  end: (planId: string, reason: string) => Promise<string>;
  /** S34: the signed agreements uploaded so far, and whether the caller may upload now (P03). */
  documents: (planId: string) => Promise<{ list: PlanDocument[]; canUpload: boolean }>;
  pickPdf: () => Promise<PickedPdf | null>;
  upload: (planId: string, file: PickedPdf) => Promise<string>;
  documentUrl: (path: string) => Promise<string | null>;
};

type SummaryRow = {
  plan_id: string;
  status: PlanStatus;
  other_id: string;
  other_name: string;
  item_title: string;
  idea_id: string | null;
  started_by_me: boolean;
  milestones: number;
  confirmed: number;
  expires_at: string;
  stage1_agreed_at: string | null;
};

const toSummary = (r: SummaryRow): PlanSummary => ({
  id: r.plan_id,
  status: r.status,
  otherId: r.other_id,
  otherName: r.other_name,
  itemTitle: r.item_title,
  ideaId: r.idea_id,
  startedByMe: r.started_by_me,
  milestones: r.milestones,
  confirmed: r.confirmed,
  expiresAt: r.expires_at,
  stage1AgreedAt: r.stage1_agreed_at,
});

const first = (data: unknown) =>
  ((data as { result: string; plan_id: string | null }[] | null) ?? [])[0] ?? {
    result: "error",
    plan_id: null,
  };

/** S30 to S34: milestone plans (P01 to P03). The PDF picker is passed in, so tests need no device. */
export function plansApiWith(pickPdf: () => Promise<PickedPdf | null>): PlansApi {
  const api: PlansApi = {
    async mine() {
      const { data, error } = await supabase.rpc("my_plans");
      if (error) throw error;
      return (data as SummaryRow[]).map(toSummary);
    },

    async load(planId) {
      const plan = (await api.mine()).find((p) => p.id === planId);
      if (!plan) return null;
      const [{ data, error }, closed] = await Promise.all([
        supabase
          .from("milestones")
          .select("id, position, title, description, target_date, responsible_member_id, status")
          .eq("plan_id", planId)
          .order("position"),
        supabase
          .from("milestone_plans")
          .select("withdrawn_by, withdrawn_at, ended_by, ended_at, ended_reason")
          .eq("id", planId)
          .maybeSingle(),
      ]);
      if (error) throw error;
      const c = closed.data as {
        withdrawn_by: string | null;
        withdrawn_at: string | null;
        ended_by: string | null;
        ended_at: string | null;
        ended_reason: string | null;
      } | null;
      const by = c?.ended_by ?? c?.withdrawn_by ?? null;
      return {
        ...plan,
        closedByMe: by === null ? null : by !== plan.otherId,
        closedAt: c?.ended_at ?? c?.withdrawn_at ?? null,
        endedReason: c?.ended_reason ?? null,
        milestoneList: (
          data as {
            id: string;
            position: number;
            title: string;
            description: string;
            target_date: string | null;
            responsible_member_id: string;
            status: Milestone["status"];
          }[]
        ).map((m) => ({
          id: m.id,
          position: m.position,
          title: m.title,
          description: m.description,
          targetDate: m.target_date,
          responsibleIsMe: m.responsible_member_id !== plan.otherId,
          status: m.status,
        })),
      };
    },

    async partners() {
      const { data, error } = await supabase.rpc("plan_partners");
      if (error) throw error;
      return (
        data as { idea_id: string; idea_title: string; other_id: string; other_name: string }[]
      ).map((r) => ({
        ideaId: r.idea_id,
        ideaTitle: r.idea_title,
        otherId: r.other_id,
        otherName: r.other_name,
      }));
    },

    async handoff() {
      const { data, error } = await supabase.rpc("handoff_text");
      if (error) throw error;
      return ((data as PendingText[] | null) ?? [])[0] ?? null;
    },

    async propose(ideaId, otherId, steps, handoffId) {
      const { data, error } = await supabase.rpc("propose_plan", {
        idea: ideaId,
        other: otherId,
        steps: steps.map((s) => ({
          title: s.title,
          description: s.description,
          target_date: s.targetDate,
          responsible: s.responsible,
        })),
        handoff: handoffId,
      });
      if (error) throw error;
      const row = first(data);
      return { result: row.result, planId: row.plan_id };
    },

    async restart(planId, handoffId) {
      const { data, error } = await supabase.rpc("restart_plan", {
        plan: planId,
        handoff: handoffId,
      });
      if (error) throw error;
      const row = first(data);
      return { result: row.result, planId: row.plan_id };
    },

    async accept(planId, handoffId) {
      const { data, error } = await supabase.rpc("accept_plan", {
        plan: planId,
        handoff: handoffId,
      });
      if (error) throw error;
      return data as string;
    },

    async withdraw(planId) {
      const { data, error } = await supabase.rpc("withdraw_plan", { plan: planId });
      if (error) throw error;
      return data as string;
    },

    async markDone(milestoneId) {
      const { data, error } = await supabase.rpc("mark_milestone_done", { milestone: milestoneId });
      if (error) throw error;
      return data as string;
    },

    async confirm(milestoneId) {
      const { data, error } = await supabase.rpc("confirm_milestone", { milestone: milestoneId });
      if (error) throw error;
      return data as string;
    },

    async end(planId, reason) {
      const { data, error } = await supabase.rpc("end_plan", { plan: planId, reason });
      if (error) throw error;
      return data as string;
    },

    async documents(planId) {
      const me = (await supabase.auth.getUser()).data.user?.id;
      const [{ data, error }, can] = await Promise.all([
        supabase
          .from("plan_documents")
          .select("uploaded_by, storage_path, uploaded_at")
          .eq("plan_id", planId),
        supabase.rpc("can_upload_plan_document", { plan: planId }),
      ]);
      if (error) throw error;
      return {
        list: (data as { uploaded_by: string; storage_path: string; uploaded_at: string }[]).map(
          (d) => ({
            mine: d.uploaded_by === me,
            storagePath: d.storage_path,
            uploadedAt: d.uploaded_at,
          }),
        ),
        canUpload: can.data === true,
      };
    },

    pickPdf,

    async upload(planId, file) {
      const me = (await supabase.auth.getUser()).data.user?.id;
      if (!me) return "error";
      const path = `${planId}/${me}.pdf`;
      const blob = await (await fetch(file.uri)).blob();
      const upload = await supabase.storage
        .from("plan-documents")
        .upload(path, blob, { contentType: "application/pdf" });
      if (upload.error) throw upload.error;
      const { data, error } = await supabase.rpc("record_plan_document", {
        plan: planId,
        storage_path: path,
        size: file.size,
      });
      if (error) throw error;
      return data as string;
    },

    async documentUrl(path) {
      const { data } = await supabase.storage.from("plan-documents").createSignedUrl(path, 300);
      return data?.signedUrl ?? null;
    },
  };
  return api;
}

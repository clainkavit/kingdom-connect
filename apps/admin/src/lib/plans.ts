import { supabase } from "./supabase";

export type PlanStatus = "pending" | "active" | "completed" | "lapsed" | "withdrawn" | "ended";

export type AdminPlan = {
  id: string;
  status: PlanStatus;
  memberA: string;
  memberB: string;
  startedBy: string;
  item: string;
  milestones: number;
  confirmed: number;
  createdAt: Date;
  closedAt: Date | null;
  annotations: number;
};

export type AdminStage = {
  position: number;
  title: string;
  description: string;
  targetDate: string | null;
  responsible: string;
  status: "open" | "done" | "confirmed";
};

export type AdminNote = {
  kind: "ended" | "annotation";
  author: string;
  note: string;
  createdAt: Date;
};

export type PlansAdminApi = {
  plans: () => Promise<AdminPlan[]>;
  stages: (planId: string) => Promise<AdminStage[]>;
  notes: (planId: string) => Promise<AdminNote[]>;
  annotate: (planId: string, note: string) => Promise<string>;
};

/** A14: milestone plans for administrators (P04). No contact details or investor flag. */
export const plansAdminApi: PlansAdminApi = {
  async plans() {
    const { data, error } = await supabase.rpc("admin_plans");
    if (error) throw error;
    return (
      data as {
        plan_id: string;
        status: PlanStatus;
        member_a_name: string;
        member_b_name: string;
        started_by_name: string;
        item_title: string;
        milestones: number;
        confirmed: number;
        created_at: string;
        closed_at: string | null;
        annotations: number;
      }[]
    ).map((r) => ({
      id: r.plan_id,
      status: r.status,
      memberA: r.member_a_name,
      memberB: r.member_b_name,
      startedBy: r.started_by_name,
      item: r.item_title,
      milestones: r.milestones,
      confirmed: r.confirmed,
      createdAt: new Date(r.created_at),
      closedAt: r.closed_at ? new Date(r.closed_at) : null,
      annotations: r.annotations,
    }));
  },

  async stages(planId) {
    const { data, error } = await supabase.rpc("admin_plan_stages", { plan: planId });
    if (error) throw error;
    return (
      data as {
        stage_no: number;
        title: string;
        description: string;
        target_date: string | null;
        responsible_name: string;
        status: AdminStage["status"];
      }[]
    ).map((r) => ({
      position: r.stage_no,
      title: r.title,
      description: r.description,
      targetDate: r.target_date,
      responsible: r.responsible_name,
      status: r.status,
    }));
  },

  async notes(planId) {
    const { data, error } = await supabase.rpc("admin_plan_notes", { plan: planId });
    if (error) throw error;
    return (
      data as { kind: AdminNote["kind"]; author: string; note: string; created_at: string }[]
    ).map((r) => ({
      kind: r.kind,
      author: r.author,
      note: r.note,
      createdAt: new Date(r.created_at),
    }));
  },

  async annotate(planId, note) {
    const { data, error } = await supabase.rpc("annotate_plan", { plan: planId, note });
    if (error) throw error;
    return data as string;
  },
};

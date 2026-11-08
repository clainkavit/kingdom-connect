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

export type Plan = PlanSummary & { milestoneList: Milestone[] };

export type PlanPartner = { ideaId: string; ideaTitle: string; otherId: string; otherName: string };

export type StepDraft = {
  title: string;
  description: string;
  targetDate: string;
  responsible: "me" | "other";
};

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

/** S30 to S32: milestone plans (P01). */
export const plansApi: PlansApi = {
  async mine() {
    const { data, error } = await supabase.rpc("my_plans");
    if (error) throw error;
    return (data as SummaryRow[]).map(toSummary);
  },

  async load(planId) {
    const plan = (await plansApi.mine()).find((p) => p.id === planId);
    if (!plan) return null;
    const { data, error } = await supabase
      .from("milestones")
      .select("id, position, title, description, target_date, responsible_member_id, status")
      .eq("plan_id", planId)
      .order("position");
    if (error) throw error;
    return {
      ...plan,
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
    const { data, error } = await supabase.rpc("accept_plan", { plan: planId, handoff: handoffId });
    if (error) throw error;
    return data as string;
  },

  async withdraw(planId) {
    const { data, error } = await supabase.rpc("withdraw_plan", { plan: planId });
    if (error) throw error;
    return data as string;
  },
};

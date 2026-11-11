import type { IdeaStage } from "@kingdom-connect/shared";
import { ideaModerationApi } from "./ideas";
import { supabase } from "./supabase";

export const IDEAS_PAGE_SIZE = 25;

export const IDEA_LIST_STATUSES = [
  "published",
  "pending_moderation",
  "hidden",
  "archived",
  "removed",
] as const;
export type IdeaListStatus = (typeof IDEA_LIST_STATUSES)[number];

export type IdeasOverview = {
  published: number;
  waiting: number;
  hidden: number;
  archived: number;
  byStage: Partial<Record<IdeaStage, number>>;
  byIndustry: { sectorEn: string; sectorSw: string; ideas: number }[];
  interestSent: number;
  ownerApproved: number;
  ndaAccepted: number;
};

export type IdeaRow = {
  id: string;
  title: string;
  postedBy: string;
  sharedWithoutName: boolean;
  sectorEn: string;
  sectorSw: string;
  stage: IdeaStage;
  status: IdeaListStatus;
  interested: number;
  withAccess: number;
  lastActivity: Date;
};

export type IdeaFilters = {
  query?: string;
  status?: IdeaListStatus;
  sector?: string;
  stage?: IdeaStage;
};

export type WaitingIdea = {
  id: string;
  title: string;
  sectorEn: string;
  sectorSw: string;
  stage: IdeaStage;
  postedBy: string;
  sharedWithoutName: boolean;
};

export type Sector = { id: string; nameEn: string; nameSw: string };

export type IdeasOverviewApi = {
  overview: () => Promise<IdeasOverview>;
  list: (filters: IdeaFilters, page: number) => Promise<IdeaRow[]>;
  waiting: () => Promise<WaitingIdea[]>;
  sectors: () => Promise<Sector[]>;
};

/** A17 (D05): ideas in brief for staff. Never the confidential details, never who is interested. */
export const ideasOverviewApi: IdeasOverviewApi = {
  async overview() {
    const { data, error } = await supabase.rpc("admin_ideas_overview");
    if (error) throw error;
    const row = (
      data as {
        published: number;
        waiting: number;
        hidden: number;
        archived: number;
        by_stage: Partial<Record<IdeaStage, number>>;
        by_industry: { sector_en: string; sector_sw: string; ideas: number }[];
        interest_sent: number;
        owner_approved: number;
        nda_accepted: number;
      }[]
    )[0]!;
    return {
      published: row.published,
      waiting: row.waiting,
      hidden: row.hidden,
      archived: row.archived,
      byStage: row.by_stage,
      byIndustry: row.by_industry.map((s) => ({
        sectorEn: s.sector_en,
        sectorSw: s.sector_sw,
        ideas: s.ideas,
      })),
      interestSent: row.interest_sent,
      ownerApproved: row.owner_approved,
      ndaAccepted: row.nda_accepted,
    };
  },

  async list(filters, page) {
    const { data, error } = await supabase.rpc("admin_ideas_list", {
      query: filters.query ?? null,
      status: filters.status ?? null,
      sector: filters.sector ?? null,
      stage: filters.stage ?? null,
      page,
    });
    if (error) throw error;
    return (
      data as {
        idea_id: string;
        title: string;
        posted_by: string;
        shared_without_name: boolean;
        sector_en: string;
        sector_sw: string;
        stage: IdeaStage;
        status: IdeaListStatus;
        interested: number;
        with_access: number;
        last_activity: string;
      }[]
    ).map((r) => ({
      id: r.idea_id,
      title: r.title,
      postedBy: r.posted_by,
      sharedWithoutName: r.shared_without_name,
      sectorEn: r.sector_en,
      sectorSw: r.sector_sw,
      stage: r.stage,
      status: r.status,
      interested: r.interested,
      withAccess: r.with_access,
      lastActivity: new Date(r.last_activity),
    }));
  },

  async waiting() {
    const queue = await ideaModerationApi.queue();
    return queue.map((i) => ({
      id: i.id,
      title: i.title,
      sectorEn: i.sectorEn,
      sectorSw: i.sectorSw,
      stage: i.stage,
      postedBy: i.ownerUsername,
      sharedWithoutName: !i.showOwner,
    }));
  },

  async sectors() {
    const { data, error } = await supabase
      .from("sectors")
      .select("id, name_en, name_sw")
      .order("name_en");
    if (error) throw error;
    return data.map((s) => ({
      id: s.id as string,
      nameEn: s.name_en as string,
      nameSw: s.name_sw as string,
    }));
  },
};

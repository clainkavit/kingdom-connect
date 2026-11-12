import type { PostKind } from "./opportunity-browse";
import { supabase } from "./supabase";

export const LATEST_TABS = ["all", "jobs", "training", "tenders", "investments", "ideas"] as const;
export type LatestTab = (typeof LATEST_TABS)[number];

export type LatestItem = {
  kind: "opportunity" | "training" | "idea";
  id: string;
  title: string;
  subtype: string | null;
  sector: { en: string; sw: string } | null;
  publishedAt: Date | null;
};

export type FeaturedPost = {
  id: string;
  type: PostKind;
  title: string;
  sector: { en: string; sw: string };
  posterName: string;
  closingAt: string;
};

export type DashboardWidgetsApi = {
  featured: () => Promise<FeaturedPost[]>;
  latest: (tab: LatestTab) => Promise<LatestItem[]>;
};

/** S08's Release 2 widgets (D01): open featured posts, and the newest items by tab. No counts. */
export const dashboardWidgetsApi: DashboardWidgetsApi = {
  async featured() {
    const { data, error } = await supabase.rpc("featured_for_members");
    if (error) throw error;
    return (
      data as {
        id: string;
        type: PostKind;
        title: string;
        sector_en: string;
        sector_sw: string;
        poster_name: string;
        closing_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      sector: { en: r.sector_en, sw: r.sector_sw },
      posterName: r.poster_name,
      closingAt: r.closing_at,
    }));
  },

  async latest(tab) {
    const { data, error } = await supabase.rpc("dashboard_latest", { tab, max_rows: 6 });
    if (error) throw error;
    return (
      data as {
        item_kind: LatestItem["kind"];
        item_id: string;
        title: string;
        subtype: string | null;
        sector_en: string | null;
        sector_sw: string | null;
        published_at: string | null;
      }[]
    ).map((r) => ({
      kind: r.item_kind,
      id: r.item_id,
      title: r.title,
      subtype: r.subtype,
      sector: r.sector_en ? { en: r.sector_en, sw: r.sector_sw ?? r.sector_en } : null,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
    }));
  },
};

import { supabase } from "./supabase";

export type FeaturedRow = {
  id: string;
  title: string;
  type: string;
  posterName: string;
  closingAt: string;
};

export type FeatureResult =
  | "ok"
  | "not_staff"
  | "not_found"
  | "not_published"
  | "already_featured"
  | "slots_full"
  | "not_featured"
  | "failed";

export type FeaturedApi = {
  slots: () => Promise<{ used: number; limit: number }>;
  featured: () => Promise<FeaturedRow[]>;
  featurable: (query: string) => Promise<FeaturedRow[]>;
  setFeatured: (id: string, featured: boolean) => Promise<FeatureResult>;
};

type Row = { id: string; title: string; type: string; poster_name: string; closing_at: string };

const row = (r: Row): FeaturedRow => ({
  id: r.id,
  title: r.title,
  type: r.type,
  posterName: r.poster_name,
  closingAt: r.closing_at,
});

/** A12 (O05): featured opportunities, up to the featured_slot_limit setting. */
export const featuredApi: FeaturedApi = {
  async slots() {
    const { data, error } = await supabase.rpc("featured_slots");
    if (error) throw error;
    const r = (data as { used: number; slot_limit: number }[])[0];
    return { used: r?.used ?? 0, limit: r?.slot_limit ?? 0 };
  },

  async featured() {
    const { data, error } = await supabase.rpc("admin_featured");
    if (error) throw error;
    return (data as Row[]).map(row);
  },

  async featurable(query) {
    const { data, error } = await supabase.rpc("featurable_opportunities", {
      query: query.trim() || null,
    });
    if (error) throw error;
    return (data as Row[]).map(row);
  },

  async setFeatured(id, featured) {
    const { data, error } = await supabase.rpc("set_opportunity_featured", {
      opportunity: id,
      featured,
    });
    return error ? "failed" : (data as FeatureResult);
  },
};

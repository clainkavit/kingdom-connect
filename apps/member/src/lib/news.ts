import { supabase } from "./supabase";

export type MemberNewsItem = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  publishedAt: string;
};

export type MemberNewsApi = { list: () => Promise<MemberNewsItem[]> };

type Row = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  pinned: boolean;
  published_at: string;
};

/** S39: published news, pinned items first, newest first (T04). */
export const memberNewsApi: MemberNewsApi = {
  async list() {
    const { data, error } = await supabase
      .from("news_items")
      .select("id, title, body, image_path, pinned, published_at")
      .eq("status", "published")
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = data as Row[];
    const paths = rows.map((r) => r.image_path).filter((p): p is string => p !== null);
    const links = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("public-media")
        .createSignedUrls(paths, 600);
      for (const link of signed ?? []) {
        if (link.path && link.signedUrl) links.set(link.path, link.signedUrl);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      imageUrl: r.image_path ? (links.get(r.image_path) ?? null) : null,
      pinned: r.pinned,
      publishedAt: r.published_at,
    }));
  },
};

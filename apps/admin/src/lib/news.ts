import { supabase } from "./supabase";

const BUCKET = "public-media";
const LINK_SECONDS = 600;

export type NewsItem = {
  id: string;
  title: string;
  body: string;
  imagePath: string | null;
  imageUrl: string | null;
  pinned: boolean;
  status: "draft" | "published";
  publishedAt: string | null;
};

export type NewsDraft = {
  title: string;
  body: string;
  pinned: boolean;
  publish: boolean;
  /** The image already saved on the item, or null to have none. */
  imagePath: string | null;
  /** A new image to upload in place of imagePath. */
  image: File | null;
};

export type NewsApi = {
  list: () => Promise<NewsItem[]>;
  save: (id: string | null, draft: NewsDraft) => Promise<void>;
  remove: (item: NewsItem) => Promise<void>;
};

type Row = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  pinned: boolean;
  status: "draft" | "published";
  published_at: string | null;
};

const extension = (file: File) =>
  file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

/** A11: staff write, publish, pin and delete news (T04). */
export const newsApi: NewsApi = {
  async list() {
    const { data, error } = await supabase
      .from("news_items")
      .select("id, title, body, image_path, pinned, status, published_at")
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data as Row[];
    const paths = rows.map((r) => r.image_path).filter((p): p is string => p !== null);
    const links = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, LINK_SECONDS);
      for (const link of signed ?? []) {
        if (link.path && link.signedUrl) links.set(link.path, link.signedUrl);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      imagePath: r.image_path,
      imageUrl: r.image_path ? (links.get(r.image_path) ?? null) : null,
      pinned: r.pinned,
      status: r.status,
      publishedAt: r.published_at,
    }));
  },

  async save(id, draft) {
    let imagePath = draft.imagePath;
    if (draft.image) {
      imagePath = `news/${crypto.randomUUID()}.${extension(draft.image)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(imagePath, draft.image, { contentType: draft.image.type });
      if (error) throw error;
    }
    const fields = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      pinned: draft.pinned,
      image_path: imagePath,
      status: draft.publish ? "published" : "draft",
    };
    if (id === null) {
      const { error } = await supabase
        .from("news_items")
        .insert({ ...fields, published_at: draft.publish ? new Date().toISOString() : null });
      if (error) throw error;
      return;
    }
    const { data: current, error: readError } = await supabase
      .from("news_items")
      .select("published_at")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    const publishedAt = draft.publish
      ? ((current as { published_at: string | null }).published_at ?? new Date().toISOString())
      : null;
    const { error } = await supabase
      .from("news_items")
      .update({ ...fields, published_at: publishedAt })
      .eq("id", id);
    if (error) throw error;
  },

  async remove(item) {
    const { error } = await supabase.from("news_items").delete().eq("id", item.id);
    if (error) throw error;
    if (item.imagePath) await supabase.storage.from(BUCKET).remove([item.imagePath]);
  },
};

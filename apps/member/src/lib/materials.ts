import { supabase } from "./supabase";

export type Material = {
  id: string;
  kind: "file" | "link";
  title: string;
  storagePath: string | null;
  size: number | null;
  url: string | null;
};

export type PickedPdf = { uri: string; name: string; mime: string; size: number };

export type MaterialsApi = {
  list: (trainingId: string) => Promise<Material[]>;
  canManage: (trainingId: string) => Promise<boolean>;
  /** A short-lived address for a PDF: to view inside the app, or to download when allowed. */
  fileUrl: (path: string, download: boolean) => Promise<string | null>;
  pickPdf: () => Promise<PickedPdf | null>;
  addFile: (trainingId: string, title: string, file: PickedPdf) => Promise<string>;
  addLink: (trainingId: string, title: string, url: string) => Promise<string>;
  remove: (material: Material) => Promise<string>;
};

const BUCKET = "learning-materials";

/** S36: learning materials (T02). The file picker is passed in, so tests need no device. */
export const materialsApi = (pickPdf: () => Promise<PickedPdf | null>): MaterialsApi => ({
  async list(trainingId) {
    const { data, error } = await supabase
      .from("training_materials")
      .select("id, kind, title, storage_path, size, url")
      .eq("training_id", trainingId)
      .order("created_at");
    if (error) throw error;
    return (
      data as {
        id: string;
        kind: Material["kind"];
        title: string;
        storage_path: string | null;
        size: number | null;
        url: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      storagePath: r.storage_path,
      size: r.size,
      url: r.url,
    }));
  },

  async canManage(trainingId) {
    const { data, error } = await supabase.rpc("can_manage_training", { training: trainingId });
    if (error) throw error;
    return data === true;
  },

  async fileUrl(path, download) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 300, download ? { download: true } : undefined);
    return data?.signedUrl ?? null;
  },

  pickPdf,

  async addFile(trainingId, title, file) {
    const path = `${trainingId}/${crypto.randomUUID()}.pdf`;
    const blob = await (await fetch(file.uri)).blob();
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "application/pdf" });
    if (upload.error) throw upload.error;
    const { data, error } = await supabase.rpc("add_training_material", {
      training: trainingId,
      kind: "file",
      title,
      storage_path: path,
      size: file.size,
      url: null,
    });
    const result = (data as { result: string }[] | null)?.[0]?.result ?? "error";
    if (error || result !== "ok") await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    return result;
  },

  async addLink(trainingId, title, url) {
    const { data, error } = await supabase.rpc("add_training_material", {
      training: trainingId,
      kind: "link",
      title,
      storage_path: null,
      size: null,
      url,
    });
    if (error) throw error;
    return (data as { result: string }[])[0]?.result ?? "error";
  },

  async remove(material) {
    const { data, error } = await supabase.rpc("remove_training_material", {
      material: material.id,
    });
    if (error) throw error;
    if (data === "ok" && material.storagePath) {
      await supabase.storage.from(BUCKET).remove([material.storagePath]);
    }
    return data as string;
  },
});

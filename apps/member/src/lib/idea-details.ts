import { functionsKey, functionsUrl, supabase } from "./supabase";

export type IdeaDetails = {
  title: string;
  description: string;
  businessModel: string;
  market: string;
  financials: string;
  team: string;
  isOwner: boolean;
  viewerName: string;
  openedAt: string;
};

export type IdeaFile = { id: string; fileName: string; mime: string; size: number };
export type PickedIdeaFile = { uri: string; name: string; mime: string; size: number };

export const IDEA_FILES_MAX_BYTES = 20 * 1024 * 1024;
export const IDEA_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const BUCKET = "idea-files";

export type IdeaDetailsApi = {
  /** Opens the details, which logs the view. Null when the viewer has no access. */
  open: (ideaId: string) => Promise<IdeaDetails | null>;
  files: (ideaId: string) => Promise<IdeaFile[]>;
  /** A local address for the file, stamped with the viewer's name and date by the server. */
  openFile: (fileId: string) => Promise<string | null>;
  pickFile: () => Promise<PickedIdeaFile | null>;
  addFile: (ideaId: string, file: PickedIdeaFile) => Promise<string>;
  removeFile: (fileId: string) => Promise<boolean>;
};

/** S26: the details of an idea and its files (I05). The file picker is passed in, so tests need no device. */
export const ideaDetailsApi = (pickFile: () => Promise<PickedIdeaFile | null>): IdeaDetailsApi => ({
  async open(ideaId) {
    const { data, error } = await supabase.rpc("open_idea_details", { idea: ideaId });
    if (error) throw error;
    const row = (
      data as
        | {
            title: string;
            description: string;
            business_model: string | null;
            market: string | null;
            financials: string | null;
            team: string | null;
            is_owner: boolean;
            viewer_name: string;
            opened_at: string;
          }[]
        | null
    )?.[0];
    if (!row) return null;
    return {
      title: row.title,
      description: row.description,
      businessModel: row.business_model ?? "",
      market: row.market ?? "",
      financials: row.financials ?? "",
      team: row.team ?? "",
      isOwner: row.is_owner,
      viewerName: row.viewer_name,
      openedAt: row.opened_at,
    };
  },

  async files(ideaId) {
    const { data, error } = await supabase
      .from("idea_files")
      .select("id, file_name, mime, size")
      .eq("idea_id", ideaId)
      .order("created_at");
    if (error) throw error;
    return (data as { id: string; file_name: string; mime: string; size: number }[]).map((f) => ({
      id: f.id,
      fileName: f.file_name,
      mime: f.mime,
      size: f.size,
    }));
  },

  async openFile(fileId) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`${functionsUrl}/idea-file`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: functionsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileId }),
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  },

  pickFile,

  async addFile(ideaId, file) {
    const extension = EXTENSION[file.mime];
    if (!extension) return "invalid_file";
    const path = `${ideaId}/${crypto.randomUUID()}.${extension}`;
    const blob = await (await fetch(file.uri)).blob();
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: file.mime });
    if (upload.error) throw upload.error;
    const { data, error } = await supabase.rpc("add_idea_file", {
      idea: ideaId,
      file_name: file.name,
      storage_path: path,
      size: file.size,
    });
    const result = (data as { result: string }[] | null)?.[0]?.result ?? "error";
    if (error || result !== "ok") await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    return result;
  },

  async removeFile(fileId) {
    const { data, error } = await supabase.rpc("remove_idea_file", { file: fileId });
    if (error) throw error;
    if (typeof data !== "string") return false;
    await supabase.storage.from(BUCKET).remove([data]);
    return true;
  },
});

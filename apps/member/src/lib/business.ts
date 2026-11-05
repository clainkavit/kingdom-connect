import type { Language } from "@kingdom-connect/shared";
import { fileProblem, type PickedFile } from "./messages";
import { sectorOptions, type Option } from "./registration";
import { supabase } from "./supabase";

export const BUSINESS_SIZES = ["micro", "small", "medium", "large"] as const;
export type BusinessSize = (typeof BUSINESS_SIZES)[number];

export const DOCUMENT_KINDS = ["brela", "tin", "licence"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type BusinessForm = {
  name: string;
  sectorId: string;
  size: BusinessSize | "";
  description: string;
  brelaNo: string;
  tin: string;
  licenceNo: string;
  licenceExpiresOn: string;
};

export type BusinessStatus = BusinessForm & {
  level: number | null;
  businessStatus: "pending" | "approved" | "rejected" | "expired";
  requestStatus: "pending" | "approved" | "rejected" | null;
  reason: string | null;
  submittedAt: string | null;
};

export type SubmitResult =
  | "ok"
  | "invalid_name"
  | "invalid_sector"
  | "invalid_size"
  | "too_long"
  | "contact_details"
  | "invalid_number"
  | "invalid_tin"
  | "licence_expired"
  | "invalid_date"
  | "documents_missing"
  | "already_pending"
  | "already_approved"
  | "file_too_large"
  | "file_wrong_type"
  | "failed";

export type BusinessApi = {
  load: () => Promise<BusinessStatus | null>;
  sectors: (language: Language) => Promise<Option[]>;
  submit: (form: BusinessForm, files: Record<DocumentKind, PickedFile>) => Promise<SubmitResult>;
  pickFile: () => Promise<PickedFile | null>;
};

const refusals: SubmitResult[] = [
  "invalid_name",
  "invalid_sector",
  "invalid_size",
  "too_long",
  "contact_details",
  "invalid_number",
  "invalid_tin",
  "licence_expired",
  "invalid_date",
  "documents_missing",
  "already_pending",
  "already_approved",
];

const extensionOf = (mime: string) =>
  mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "bin");

export function businessApi(pick: () => Promise<PickedFile | null>): BusinessApi {
  return {
    async load() {
      const { data, error } = await supabase.rpc("my_business");
      if (error) throw error;
      const row = (
        data as
          | {
              name: string;
              sector_id: string;
              size: BusinessSize;
              description: string | null;
              brela_no: string;
              tin: string;
              licence_no: string;
              licence_expires_on: string;
              level: number | null;
              business_status: BusinessStatus["businessStatus"];
              request_status: BusinessStatus["requestStatus"];
              reason: string | null;
              submitted_at: string | null;
            }[]
          | null
      )?.[0];
      if (!row) return null;
      return {
        name: row.name,
        sectorId: row.sector_id,
        size: row.size,
        description: row.description ?? "",
        brelaNo: row.brela_no,
        tin: row.tin,
        licenceNo: row.licence_no,
        licenceExpiresOn: row.licence_expires_on,
        level: row.level,
        businessStatus: row.business_status,
        requestStatus: row.request_status,
        reason: row.reason,
        submittedAt: row.submitted_at,
      };
    },

    sectors: sectorOptions,

    async submit(form, files) {
      for (const file of Object.values(files)) {
        const problem = fileProblem(file);
        if (problem) return problem === "too_large" ? "file_too_large" : "file_wrong_type";
      }
      const { data: session } = await supabase.auth.getSession();
      const me = session.session?.user.id ?? "";
      const paths = {} as Record<DocumentKind, string>;
      const uploaded: string[] = [];
      for (const kind of DOCUMENT_KINDS) {
        const file = files[kind];
        const path = `${me}/${crypto.randomUUID()}-${kind}.${extensionOf(file.mime)}`;
        const blob = await (await fetch(file.uri)).blob();
        const upload = await supabase.storage
          .from("business-documents")
          .upload(path, blob, { contentType: file.mime });
        if (upload.error) {
          if (uploaded.length) await supabase.storage.from("business-documents").remove(uploaded);
          return "failed";
        }
        paths[kind] = path;
        uploaded.push(path);
      }
      const { data, error } = await supabase.rpc("submit_business_verification", {
        business_name: form.name,
        sector: form.sectorId,
        size: form.size,
        description: form.description,
        brela_no: form.brelaNo,
        tin: form.tin,
        licence_no: form.licenceNo,
        licence_expires_on: form.licenceExpiresOn,
        brela_path: paths.brela,
        tin_path: paths.tin,
        licence_path: paths.licence,
      });
      const result: SubmitResult = error
        ? "failed"
        : (refusals.find((r) => r === data) ?? (data === "ok" ? "ok" : "failed"));
      if (result !== "ok") await supabase.storage.from("business-documents").remove(uploaded);
      return result;
    },

    pickFile: pick,
  };
}

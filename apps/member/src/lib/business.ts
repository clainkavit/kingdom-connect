import type { Language } from "@kingdom-connect/shared";
import { fileProblem, type PickedFile } from "./messages";
import { districtOptions, regionOptions, sectorOptions, type Option } from "./registration";
import { supabase } from "./supabase";

export const BUSINESS_SIZES = ["micro", "small", "medium", "large"] as const;
export type BusinessSize = (typeof BUSINESS_SIZES)[number];

export const DOCUMENT_KINDS = ["brela", "tin", "licence"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const PROOF_KINDS = ["directorship", "authorisation_letter"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export type PosterForm = {
  proofKind: ProofKind | "";
  address: string;
  regionId: string;
  districtId: string;
};

export type PosterStatus = PosterForm & {
  requestStatus: "pending" | "approved" | "rejected" | null;
  reason: string | null;
};

export type PosterFiles = { proof: PickedFile; addressProof: PickedFile };

export type PosterResult =
  | "ok"
  | "level2_required"
  | "already_pending"
  | "already_approved"
  | "invalid_proof_kind"
  | "invalid_address"
  | "contact_details"
  | "invalid_region"
  | "documents_missing"
  | "file_too_large"
  | "file_wrong_type"
  | "failed";

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
  loadPoster: () => Promise<PosterStatus | null>;
  regions: (language: Language) => Promise<Option[]>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
  submitPoster: (form: PosterForm, files: PosterFiles) => Promise<PosterResult>;
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

const posterRefusals: PosterResult[] = [
  "level2_required",
  "already_pending",
  "already_approved",
  "invalid_proof_kind",
  "invalid_address",
  "contact_details",
  "invalid_region",
  "documents_missing",
];

const extensionOf = (mime: string) =>
  mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "bin");

const BUCKET = "business-documents";

/** Uploads each file into the member's folder; on any failure removes what was uploaded and returns null. */
async function uploadAll<K extends string>(
  files: Record<K, PickedFile>,
): Promise<Record<K, string> | null> {
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id ?? "";
  const paths = {} as Record<K, string>;
  const uploaded: string[] = [];
  for (const kind of Object.keys(files) as K[]) {
    const file = files[kind];
    const path = `${me}/${crypto.randomUUID()}-${kind}.${extensionOf(file.mime)}`;
    const blob = await (await fetch(file.uri)).blob();
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: file.mime });
    if (upload.error) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      return null;
    }
    paths[kind] = path;
    uploaded.push(path);
  }
  return paths;
}

function resultOf<R extends string>(
  error: unknown,
  data: unknown,
  refusals: readonly R[],
): R | "ok" | "failed" {
  if (error) return "failed";
  return refusals.find((r) => r === data) ?? (data === "ok" ? "ok" : "failed");
}

function fileRefusal(files: PickedFile[]): "file_too_large" | "file_wrong_type" | null {
  for (const file of files) {
    const problem = fileProblem(file);
    if (problem) return problem === "too_large" ? "file_too_large" : "file_wrong_type";
  }
  return null;
}

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
      const refused = fileRefusal(DOCUMENT_KINDS.map((k) => files[k]));
      if (refused) return refused;
      const paths = await uploadAll(files);
      if (!paths) return "failed";
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
      const result: SubmitResult = resultOf(error, data, refusals);
      if (result !== "ok") await supabase.storage.from(BUCKET).remove(Object.values(paths));
      return result;
    },

    pickFile: pick,

    async loadPoster() {
      const { data, error } = await supabase.rpc("my_poster_verification");
      if (error) throw error;
      const row = (
        data as
          | {
              request_status: PosterStatus["requestStatus"];
              reason: string | null;
              proof_kind: ProofKind | null;
              address: string | null;
              region_id: string | null;
              district_id: string | null;
            }[]
          | null
      )?.[0];
      if (!row) return null;
      return {
        requestStatus: row.request_status,
        reason: row.reason,
        proofKind: row.proof_kind ?? "",
        address: row.address ?? "",
        regionId: row.region_id ?? "",
        districtId: row.district_id ?? "",
      };
    },

    regions: regionOptions,

    districts: districtOptions,

    async submitPoster(form, files) {
      const refused = fileRefusal([files.proof, files.addressProof]);
      if (refused) return refused;
      const paths = await uploadAll(files);
      if (!paths) return "failed";
      const { data, error } = await supabase.rpc("submit_poster_verification", {
        proof_kind: form.proofKind,
        proof_path: paths.proof,
        address: form.address,
        region: form.regionId,
        district: form.districtId,
        address_proof_path: paths.addressProof,
      });
      const result: PosterResult = resultOf(error, data, posterRefusals);
      if (result !== "ok") await supabase.storage.from(BUCKET).remove(Object.values(paths));
      return result;
    },
  };
}

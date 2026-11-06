import type { Language } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type BusinessDocument = {
  kind: "brela" | "tin" | "licence" | "directorship" | "authorisation_letter" | "address_proof";
  url: string | null;
  isPdf: boolean;
};

export type BusinessLevel = 2 | 3;

export type BusinessReviewData = {
  id: string;
  pending: boolean;
  status: string;
  reason: string | null;
  submittedAt: Date;
  ownerName: string;
  ownerUsername: string;
  name: string;
  sector: { en: string; sw: string };
  size: "micro" | "small" | "medium" | "large";
  description: string;
  brelaNo: string;
  tin: string;
  licenceNo: string;
  licenceExpiresOn: string;
  level: BusinessLevel;
  address: string;
  region: { en: string; sw: string } | null;
  district: { en: string; sw: string } | null;
  proofKind: "directorship" | "authorisation_letter" | null;
  renewal: { licenceNo: string; licenceExpiresOn: string } | null;
  documents: BusinessDocument[];
};

export type BusinessReason = { code: string; label: string; needsNote: boolean };

export type BusinessDecision =
  | "ok"
  | "already_decided"
  | "reason_required"
  | "note_has_contact_details"
  | "not_found"
  | "failed";

export type BusinessReviewApi = {
  load: (id: string) => Promise<BusinessReviewData | null>;
  reasons: (language: Language, level: BusinessLevel) => Promise<BusinessReason[]>;
  decide: (
    id: string,
    approve: boolean,
    reasonCode: string,
    note: string,
  ) => Promise<BusinessDecision>;
};

const LINK_SECONDS = 300;
const DOCUMENTS_BY_LEVEL: Record<BusinessLevel, BusinessDocument["kind"][]> = {
  2: ["brela", "tin", "licence"],
  3: ["directorship", "authorisation_letter", "address_proof"],
};

type NamedRow = { name_en: string; name_sw: string };
type PrivateRow = {
  brela_no: string;
  tin: string;
  licence_no: string;
  licence_expires_on: string;
  address: string | null;
  region: NamedRow | null;
  district: NamedRow | null;
};
const decisions: BusinessDecision[] = [
  "already_decided",
  "reason_required",
  "note_has_contact_details",
  "not_found",
];

type Row = {
  id: string;
  level: BusinessLevel;
  status: string;
  reason: string | null;
  submitted_at: string;
  member: { username: string; profile: { full_name: string } | null };
  business: {
    name: string;
    size: BusinessReviewData["size"];
    description: string | null;
    sector: { name_en: string; name_sw: string };
    private: PrivateRow | PrivateRow[];
  } | null;
  documents: { kind: BusinessDocument["kind"]; storage_path: string }[];
  renewal:
    | { licence_no: string; licence_expires_on: string }
    | { licence_no: string; licence_expires_on: string }[]
    | null;
};

export const businessReviewApi: BusinessReviewApi = {
  async load(id) {
    const { data, error } = await supabase
      .from("verification_requests")
      .select(
        `id, level, status, reason, submitted_at,
         member:members!verification_requests_member_id_fkey(username, profile:profiles(full_name)),
         business:businesses!verification_requests_business_id_fkey(name, size, description,
           sector:sectors(name_en, name_sw),
           private:business_private(brela_no, tin, licence_no, licence_expires_on, address,
             region:regions(name_en, name_sw), district:districts(name_en, name_sw))),
         documents:verification_documents(kind, storage_path),
         renewal:licence_renewals(licence_no, licence_expires_on)`,
      )
      .eq("id", id)
      .in("level", [2, 3])
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as Row;
    if (!row.business) return null;
    const details = Array.isArray(row.business.private)
      ? row.business.private[0]!
      : row.business.private;
    const renewal = Array.isArray(row.renewal) ? (row.renewal[0] ?? null) : row.renewal;
    const paths = row.documents.map((d) => d.storage_path);
    const { data: signed } = paths.length
      ? await supabase.storage.from("business-documents").createSignedUrls(paths, LINK_SECONDS)
      : { data: [] };
    const links = new Map(
      (signed ?? []).flatMap((s) =>
        s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [],
      ),
    );
    return {
      id: row.id,
      pending: row.status === "pending",
      status: row.status,
      reason: row.reason,
      submittedAt: new Date(row.submitted_at),
      ownerName: row.member.profile?.full_name ?? "",
      ownerUsername: row.member.username,
      name: row.business.name,
      sector: { en: row.business.sector.name_en, sw: row.business.sector.name_sw },
      size: row.business.size,
      description: row.business.description ?? "",
      brelaNo: details.brela_no,
      tin: details.tin,
      licenceNo: details.licence_no,
      licenceExpiresOn: details.licence_expires_on,
      level: row.level,
      address: details.address ?? "",
      region: details.region ? { en: details.region.name_en, sw: details.region.name_sw } : null,
      district: details.district
        ? { en: details.district.name_en, sw: details.district.name_sw }
        : null,
      proofKind:
        row.level === 3
          ? (row.documents.find(
              (d): d is { kind: "directorship" | "authorisation_letter"; storage_path: string } =>
                d.kind === "directorship" || d.kind === "authorisation_letter",
            )?.kind ?? null)
          : null,
      renewal: renewal
        ? { licenceNo: renewal.licence_no, licenceExpiresOn: renewal.licence_expires_on }
        : null,
      documents: DOCUMENTS_BY_LEVEL[row.level].flatMap((kind) => {
        const doc = row.documents.find((d) => d.kind === kind);
        return doc
          ? [
              {
                kind,
                url: links.get(doc.storage_path) ?? null,
                isPdf: doc.storage_path.toLowerCase().endsWith(".pdf"),
              },
            ]
          : [];
      }),
    };
  },

  async reasons(language, level) {
    const { data, error } = await supabase
      .from("rejection_reasons")
      .select("code, label_en, label_sw, needs_note")
      .eq(level === 3 ? "for_poster" : "for_business", true)
      .order("sort");
    if (error) throw error;
    return data.map((r) => ({
      code: r.code,
      label: language === "sw" ? r.label_sw : r.label_en,
      needsNote: r.needs_note,
    }));
  },

  async decide(id, approve, reasonCode, note) {
    const { data, error } = await supabase.rpc("decide_business_verification", {
      request: id,
      approve,
      reason_code: reasonCode || null,
      note: note.trim() || null,
    });
    if (error) return "failed";
    return data === "ok" ? "ok" : (decisions.find((d) => d === data) ?? "failed");
  },
};

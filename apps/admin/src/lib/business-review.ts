import type { Language } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type BusinessDocument = {
  kind: "brela" | "tin" | "licence";
  url: string | null;
  isPdf: boolean;
};

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
  reasons: (language: Language) => Promise<BusinessReason[]>;
  decide: (
    id: string,
    approve: boolean,
    reasonCode: string,
    note: string,
  ) => Promise<BusinessDecision>;
};

const LINK_SECONDS = 300;
const decisions: BusinessDecision[] = [
  "already_decided",
  "reason_required",
  "note_has_contact_details",
  "not_found",
];

type Row = {
  id: string;
  status: string;
  reason: string | null;
  submitted_at: string;
  member: { username: string; profile: { full_name: string } | null };
  business: {
    name: string;
    size: BusinessReviewData["size"];
    description: string | null;
    sector: { name_en: string; name_sw: string };
    private:
      | { brela_no: string; tin: string; licence_no: string; licence_expires_on: string }
      | { brela_no: string; tin: string; licence_no: string; licence_expires_on: string }[];
  } | null;
  documents: { kind: BusinessDocument["kind"]; storage_path: string }[];
};

export const businessReviewApi: BusinessReviewApi = {
  async load(id) {
    const { data, error } = await supabase
      .from("verification_requests")
      .select(
        `id, status, reason, submitted_at,
         member:members!verification_requests_member_id_fkey(username, profile:profiles(full_name)),
         business:businesses!verification_requests_business_id_fkey(name, size, description,
           sector:sectors(name_en, name_sw),
           private:business_private(brela_no, tin, licence_no, licence_expires_on)),
         documents:verification_documents(kind, storage_path)`,
      )
      .eq("id", id)
      .eq("level", 2)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as Row;
    if (!row.business) return null;
    const details = Array.isArray(row.business.private)
      ? row.business.private[0]!
      : row.business.private;
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
      documents: (["brela", "tin", "licence"] as const).flatMap((kind) => {
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

  async reasons(language) {
    const { data, error } = await supabase
      .from("rejection_reasons")
      .select("code, label_en, label_sw, needs_note")
      .eq("for_business", true)
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

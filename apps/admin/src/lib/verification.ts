import {
  createVerificationClient,
  type CategoryDetails,
  type DecideResult,
  type Decision,
  type IdType,
  type Language,
  type MarkDuplicateResult,
  type MemberCategory,
} from "@kingdom-connect/shared";
import { anonKey, supabase, url } from "./supabase";

export type QueueItem = {
  id: string;
  submittedAt: Date;
  username: string;
  fullName: string;
  suspectedDuplicate: boolean;
};

export type Application = {
  id: string;
  memberId: string;
  pending: boolean;
  submittedAt: Date;
  username: string;
  fullName: string;
  category: MemberCategory | null;
  categoryDetails: CategoryDetails;
  sectorName: string | null;
  region: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  study: { institution: string | null; course: string | null; year: number | null };
  idType: IdType | null;
  idExpiresOn: string | null;
  facePhotoUrl: string | null;
  idPhotoUrl: string | null;
  duplicate: { username: string; facePhotoUrl: string | null } | null;
};

export type RejectionReason = { code: string; label: string; needsNote: boolean };

export type VerificationApi = {
  queue: () => Promise<QueueItem[]>;
  application: (id: string, language: Language) => Promise<Application | null>;
  reasons: (language: Language) => Promise<RejectionReason[]>;
  decide: (decision: Decision) => Promise<DecideResult>;
  markDuplicate: (requestId: string, username: string) => Promise<MarkDuplicateResult>;
  revealIdNumber: (memberId: string) => Promise<string | null>;
};

type Named = { name_en: string; name_sw: string } | null;
const nameIn = (row: Named, language: Language) =>
  row ? (language === "sw" ? row.name_sw : row.name_en) : "";

const PHOTO_LINK_SECONDS = 300;

async function photoLinks(paths: string[]): Promise<Map<string, string>> {
  const { data } = await supabase.storage
    .from("identity-documents")
    .createSignedUrls(paths, PHOTO_LINK_SECONDS);
  return new Map(
    (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])),
  );
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

const staffActions = createVerificationClient({ url, anonKey });

export const verificationApi: VerificationApi = {
  async queue() {
    const { data, error } = await supabase
      .from("verification_requests")
      .select(
        "id, submitted_at, duplicate_suspected_of, member:members!verification_requests_member_id_fkey(username, profile:profiles(full_name))",
      )
      .eq("status", "pending")
      .eq("level", 1)
      .order("submitted_at");
    if (error) throw error;
    return data.map((row) => {
      const member = row.member as unknown as {
        username: string;
        profile: { full_name: string } | null;
      };
      return {
        id: row.id,
        submittedAt: new Date(row.submitted_at),
        username: member.username,
        fullName: member.profile?.full_name ?? "",
        suspectedDuplicate: row.duplicate_suspected_of !== null,
      };
    });
  },

  async application(id, language) {
    const { data, error } = await supabase
      .from("verification_requests")
      .select(
        `id, member_id, status, submitted_at, duplicate_suspected_of,
         member:members!verification_requests_member_id_fkey(username, category,
           profile:profiles(full_name, category_details, study_institution, study_course, study_year,
             region:regions(name_en, name_sw), district:districts(name_en, name_sw)),
           private:member_private(phone, email, address, id_type, id_expires_on)),
         documents:verification_documents(kind, storage_path)`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const member = data.member as unknown as {
      username: string;
      category: MemberCategory | null;
      profile: {
        full_name: string;
        category_details: CategoryDetails;
        study_institution: string | null;
        study_course: string | null;
        study_year: number | null;
        region: Named;
        district: Named;
      } | null;
      private: {
        phone: string;
        email: string;
        address: string | null;
        id_type: IdType | null;
        id_expires_on: string | null;
      } | null;
    };
    const documents = data.documents as { kind: string; storage_path: string }[];
    const pathOf = (kind: string) => documents.find((d) => d.kind === kind)?.storage_path;

    let duplicate: Application["duplicate"] = null;
    let otherFacePath: string | undefined;
    if (data.duplicate_suspected_of) {
      const { data: other } = await supabase
        .from("members")
        .select(
          "username, requests:verification_requests!verification_requests_member_id_fkey(documents:verification_documents(kind, storage_path))",
        )
        .eq("id", data.duplicate_suspected_of)
        .maybeSingle();
      const otherDocuments = (
        (other?.requests ?? []) as { documents: { kind: string; storage_path: string }[] }[]
      ).flatMap((r) => r.documents);
      otherFacePath = otherDocuments.find((d) => d.kind === "face_photo")?.storage_path;
      duplicate = { username: other?.username ?? "", facePhotoUrl: null };
    }
    const links = await photoLinks(
      [pathOf("face_photo"), pathOf("id_photo"), otherFacePath].filter((p): p is string =>
        Boolean(p),
      ),
    );
    if (duplicate && otherFacePath) duplicate.facePhotoUrl = links.get(otherFacePath) ?? null;

    const details = member.profile?.category_details ?? {};
    let sectorName: string | null = null;
    if (details.sectorId) {
      const { data: sector } = await supabase
        .from("sectors")
        .select("name_en, name_sw")
        .eq("id", details.sectorId)
        .maybeSingle();
      sectorName = sector ? nameIn(sector, language) : null;
    }

    return {
      id: data.id,
      memberId: data.member_id,
      pending: data.status === "pending",
      submittedAt: new Date(data.submitted_at),
      username: member.username,
      fullName: member.profile?.full_name ?? "",
      category: member.category,
      categoryDetails: details,
      sectorName,
      region: nameIn(member.profile?.region ?? null, language),
      district: nameIn(member.profile?.district ?? null, language),
      address: member.private?.address ?? "",
      phone: member.private?.phone ?? "",
      email: member.private?.email ?? "",
      study: {
        institution: member.profile?.study_institution ?? null,
        course: member.profile?.study_course ?? null,
        year: member.profile?.study_year ?? null,
      },
      idType: member.private?.id_type ?? null,
      idExpiresOn: member.private?.id_expires_on ?? null,
      facePhotoUrl: links.get(pathOf("face_photo") ?? "") ?? null,
      idPhotoUrl: links.get(pathOf("id_photo") ?? "") ?? null,
      duplicate,
    };
  },

  async reasons(language) {
    const { data, error } = await supabase
      .from("rejection_reasons")
      .select("code, label_en, label_sw, needs_note")
      .order("sort");
    if (error) throw error;
    return data.map((r) => ({
      code: r.code,
      label: language === "sw" ? r.label_sw : r.label_en,
      needsNote: r.needs_note,
    }));
  },

  decide: async (decision) => staffActions.decide(await accessToken(), decision),
  markDuplicate: async (requestId, username) =>
    staffActions.markDuplicate(await accessToken(), requestId, username),
  revealIdNumber: async (memberId) => staffActions.revealIdNumber(await accessToken(), memberId),
};

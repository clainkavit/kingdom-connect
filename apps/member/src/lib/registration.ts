import { compareVersions, type Language, type RegistrationDraft } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type SavedDraft = { step: number; data: RegistrationDraft; submitted: boolean };
export type Option = { value: string; label: string };

export async function loadDraft(): Promise<SavedDraft> {
  const { data, error } = await supabase
    .from("registration_drafts")
    .select("step, data, submitted_at")
    .maybeSingle();
  if (error) throw error;
  return {
    step: data?.step ?? 1,
    data: (data?.data ?? {}) as RegistrationDraft,
    submitted: Boolean(data?.submitted_at),
  };
}

export async function saveDraft(step: number, data: RegistrationDraft): Promise<void> {
  const { error } = await supabase
    .from("registration_drafts")
    .upsert({ step, data }, { onConflict: "member_id" });
  if (error) throw error;
}

export async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

/** Uploads a picked photo to the Applicant's own folder in the admin-only identity store. */
export async function uploadPhoto(kind: "face" | "id", uri: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const memberId = data.session?.user.id;
  if (!memberId) throw new Error("not signed in");
  const blob = await (await fetch(uri)).blob();
  const { error } = await supabase.storage
    .from("identity-documents")
    .upload(`${memberId}/${kind}`, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
}

type NamedRow = { id: string; name_en: string; name_sw: string };
const toOptions = (rows: NamedRow[] | null, language: Language): Option[] =>
  (rows ?? [])
    .map((row) => ({ value: row.id, label: language === "sw" ? row.name_sw : row.name_en }))
    .sort((a, b) => a.label.localeCompare(b.label));

export async function regionOptions(language: Language): Promise<Option[]> {
  const { data } = await supabase.from("regions").select("id, name_en, name_sw");
  return toOptions(data, language);
}

export async function districtOptions(regionId: string, language: Language): Promise<Option[]> {
  const { data } = await supabase
    .from("districts")
    .select("id, name_en, name_sw")
    .eq("region_id", regionId);
  return toOptions(data, language);
}

export async function sectorOptions(language: Language): Promise<Option[]> {
  const { data } = await supabase.from("sectors").select("id, name_en, name_sw");
  return toOptions(data, language);
}

export type LegalText = {
  kind: "terms" | "privacy";
  version: string;
  body_en: string;
  body_sw: string;
};

export async function currentTermsAndPrivacy(): Promise<LegalText[]> {
  const { data } = await supabase
    .from("legal_texts")
    .select("kind, version, body_en, body_sw")
    .in("kind", ["terms", "privacy"])
    .lte("effective_at", new Date().toISOString());
  const rows = (data ?? []) as LegalText[];
  return (["terms", "privacy"] as const)
    .map(
      (kind) =>
        rows
          .filter((r) => r.kind === kind)
          .sort((a, b) => compareVersions(a.version, b.version))[0],
    )
    .filter((r): r is LegalText => Boolean(r));
}

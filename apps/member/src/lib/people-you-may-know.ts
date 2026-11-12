import { photoLinks } from "./avatars";
import { supabase } from "./supabase";

export type SuggestionReason =
  | { code: "mutual"; count: number }
  | { code: "skills"; skills: string[] }
  | { code: "location"; kind: "district" | "region" }
  | { code: "profession" }
  | { code: "study" }
  | { code: "newest_in_region" };

export type Suggestion = {
  memberId: string;
  fullName: string;
  photoUrl: string | null;
  headline: string | null;
  profession: string | null;
  mutualConnections: number;
  reasons: SuggestionReason[];
};

export type PeopleYouMayKnowApi = { list: (maxRows: number) => Promise<Suggestion[]> };

type Row = {
  member_id: string;
  full_name: string;
  photo_path: string | null;
  headline: string | null;
  profession: string | null;
  mutual_connections: number;
  reasons: { code: string; detail: { count?: number; skills?: string[]; kind?: string } }[] | null;
};

function reason(r: NonNullable<Row["reasons"]>[number]): SuggestionReason | null {
  switch (r.code) {
    case "mutual":
      return { code: "mutual", count: r.detail.count ?? 0 };
    case "skills":
      return { code: "skills", skills: r.detail.skills ?? [] };
    case "location":
      return r.detail.kind === "district" || r.detail.kind === "region"
        ? { code: "location", kind: r.detail.kind }
        : null;
    case "profession":
    case "study":
    case "newest_in_region":
      return { code: r.code };
    default:
      return null;
  }
}

/** S08 (O08): suggested members, best first, with a mutual count (never names) and two reasons. */
export const peopleYouMayKnowApi: PeopleYouMayKnowApi = {
  async list(maxRows) {
    const { data, error } = await supabase.rpc("people_you_may_know", { max_rows: maxRows });
    if (error) throw error;
    const rows = data as Row[];
    const urls = await photoLinks(rows.map((r) => r.photo_path));
    return rows.map((r) => ({
      memberId: r.member_id,
      fullName: r.full_name,
      photoUrl: (r.photo_path && urls.get(r.photo_path)) || null,
      headline: r.headline,
      profession: r.profession,
      mutualConnections: r.mutual_connections,
      reasons: (r.reasons ?? []).map(reason).filter((x): x is SuggestionReason => x !== null),
    }));
  },
};

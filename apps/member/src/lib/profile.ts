import type { Language, SetSkillsResult } from "@kingdom-connect/shared";
import { regionOptions, districtOptions, type Option } from "./registration";
import { profileClient, supabase } from "./supabase";

export type Profile = {
  memberId: string;
  own: boolean;
  fullName: string;
  headline: string;
  bio: string;
  profession: string;
  experience: string;
  certifications: string;
  regionId: string | null;
  districtId: string | null;
  location: string;
  study: { institution: string; course: string; year: number | null };
  skills: string[];
  photoUrl: string | null;
  hidden: boolean;
};

export type ProfileChanges = Pick<
  Profile,
  | "headline"
  | "bio"
  | "profession"
  | "experience"
  | "certifications"
  | "regionId"
  | "districtId"
  | "hidden"
> & { study: Profile["study"] };

export type ProfileApi = {
  load: (memberId: string | null, language: Language) => Promise<Profile | null>;
  save: (changes: ProfileChanges) => Promise<boolean>;
  setSkills: (skills: string[]) => Promise<SetSkillsResult>;
  suggestSkills: (typed: string) => Promise<string[]>;
  pickAndUploadPhoto: () => Promise<string | null>;
  regions: (language: Language) => Promise<Option[]>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
};

type Named = { name_en: string; name_sw: string } | null;
const nameIn = (row: Named, language: Language) =>
  row ? (language === "sw" ? row.name_sw : row.name_en) : "";

async function session() {
  const { data } = await supabase.auth.getSession();
  return { token: data.session?.access_token ?? "", userId: data.session?.user.id ?? "" };
}

async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export function profileApi(pickImage: () => Promise<string | null>): ProfileApi {
  return {
    async load(memberId, language) {
      const { userId } = await session();
      const id = memberId ?? userId;
      const { data, error } = await supabase
        .from("profiles")
        .select(
          `member_id, full_name, headline, bio, profession, experience, certifications, photo_path,
           region_id, district_id, study_institution, study_course, study_year, hidden_from_directory,
           region:regions(name_en, name_sw), district:districts(name_en, name_sw),
           skills:profile_skills(skill:skills(name))`,
        )
        .eq("member_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const skills = (data.skills as unknown as { skill: { name: string } | null }[])
        .flatMap((s) => (s.skill ? [s.skill.name] : []))
        .sort();
      const district = nameIn(data.district as unknown as Named, language);
      const region = nameIn(data.region as unknown as Named, language);
      return {
        memberId: data.member_id,
        own: data.member_id === userId,
        fullName: data.full_name ?? "",
        headline: data.headline ?? "",
        bio: data.bio ?? "",
        profession: data.profession ?? "",
        experience: data.experience ?? "",
        certifications: data.certifications ?? "",
        regionId: data.region_id,
        districtId: data.district_id,
        location: [district, region].filter(Boolean).join(", "),
        study: {
          institution: data.study_institution ?? "",
          course: data.study_course ?? "",
          year: data.study_year,
        },
        skills,
        photoUrl: await photoUrl(data.photo_path),
        hidden: data.hidden_from_directory,
      };
    },

    async save(changes) {
      const { userId } = await session();
      const blank = (v: string) => v.trim() || null;
      const { error } = await supabase
        .from("profiles")
        .update({
          headline: blank(changes.headline),
          bio: blank(changes.bio),
          profession: blank(changes.profession),
          experience: blank(changes.experience),
          certifications: blank(changes.certifications),
          region_id: changes.regionId,
          district_id: changes.districtId,
          study_institution: blank(changes.study.institution),
          study_course: blank(changes.study.course),
          study_year: changes.study.year,
          hidden_from_directory: changes.hidden,
        })
        .eq("member_id", userId);
      return !error;
    },

    async setSkills(skills) {
      return profileClient.setSkills((await session()).token, skills);
    },

    async suggestSkills(typed) {
      const prefix = typed.trim().toLowerCase().replace(/[%_]/g, "");
      if (!prefix) return [];
      const [skills, synonyms] = await Promise.all([
        supabase.from("skills").select("name").ilike("name", `${prefix}%`).order("name").limit(6),
        supabase
          .from("skill_synonyms")
          .select("skill:skills(name)")
          .ilike("from_name", `${prefix}%`)
          .limit(6),
      ]);
      const names = [
        ...((synonyms.data ?? []) as unknown as { skill: { name: string } | null }[]).flatMap(
          (s) => (s.skill ? [s.skill.name] : []),
        ),
        ...(skills.data ?? []).map((s) => s.name as string),
      ];
      return [...new Set(names)].slice(0, 6);
    },

    async pickAndUploadPhoto() {
      const uri = await pickImage();
      if (!uri) return null;
      const { userId } = await session();
      const path = `${userId}/photo`;
      const blob = await (await fetch(uri)).blob();
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
      if (error) throw error;
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ photo_path: path })
        .eq("member_id", userId);
      if (saveError) throw saveError;
      return photoUrl(path);
    },

    regions: regionOptions,
    districts: districtOptions,
  };
}

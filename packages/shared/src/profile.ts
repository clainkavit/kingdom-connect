/** Member profiles and skill tags: PRD section 8, docs/screens.md S11 and S12. */
import { functionCaller, type FunctionOptions } from "./auth";

export const MAX_SKILLS = 20;
export const MAX_SKILL_LENGTH = 40;

/** The database's limits on the profile text fields (migration 20261103120000). */
export const profileLimits = {
  headline: 120,
  bio: 1500,
  profession: 100,
  experience: 1500,
  certifications: 500,
  studyInstitution: 150,
  studyCourse: 150,
} as const;

export const normalizeSkill = (skill: string) => skill.trim().replace(/\s+/g, " ").toLowerCase();

export type SkillProblem = "too_many" | "too_long";

export function addSkill(
  skills: string[],
  typed: string,
): { skills: string[]; problem?: SkillProblem } {
  const skill = normalizeSkill(typed);
  if (!skill || skills.includes(skill)) return { skills };
  if (skill.length > MAX_SKILL_LENGTH) return { skills, problem: "too_long" };
  if (skills.length >= MAX_SKILLS) return { skills, problem: "too_many" };
  return { skills: [...skills, skill] };
}

export type SetSkillsResult = "done" | SkillProblem | "failed";

export function createProfileClient(options: FunctionOptions) {
  const call = functionCaller(options);
  return {
    async setSkills(accessToken: string, skills: string[]): Promise<SetSkillsResult> {
      const r = await call("set-skills", { skills }, accessToken);
      if (r?.ok) return "done";
      if (r?.error === "too_many" || r?.error === "too_long") return r.error;
      return "failed";
    },
  };
}

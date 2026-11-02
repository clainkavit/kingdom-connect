/** Sign-up and registration wizard rules, PRD section 6 and docs/screens.md S02 and S05. */

export const idTypes = ["nida", "passport", "driving_licence", "voters_id"] as const;
export type IdType = (typeof idTypes)[number];

export const memberCategories = [
  "professional",
  "businessperson",
  "entrepreneur",
  "other",
] as const;
export type MemberCategory = (typeof memberCategories)[number];

export type FieldProblem =
  "required" | "username" | "email" | "phone" | "password" | "nida" | "id_number" | "study_year";

export type SignUpInput = { username: string; email: string; phone: string; password: string };

/** Accepts +255 7XX XXX XXX, 255..., or 07XX... and returns +255 followed by 9 digits, or null. */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/[\s()-]/g, "");
  const local = digits.match(/^0([67]\d{8})$/);
  if (local) return `+255${local[1]}`;
  const international = digits.match(/^\+?255(\d{9})$/);
  return international ? `+255${international[1]}` : null;
}

export const normalizeUsername = (username: string) => username.trim().toLowerCase();

export function signUpProblems(
  input: SignUpInput,
): Partial<Record<keyof SignUpInput, FieldProblem>> {
  const problems: Partial<Record<keyof SignUpInput, FieldProblem>> = {};
  const username = normalizeUsername(input.username);
  if (!username) problems.username = "required";
  else if (!/^[a-z0-9][a-z0-9._]{2,29}$/.test(username)) problems.username = "username";
  if (!input.email.trim()) problems.email = "required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) problems.email = "email";
  if (!input.phone.trim()) problems.phone = "required";
  else if (!normalizePhone(input.phone)) problems.phone = "phone";
  if (!input.password) problems.password = "required";
  else if (input.password.length < 8 || !/\d/.test(input.password)) problems.password = "password";
  return problems;
}

export const normalizeIdNumber = (number: string) => number.replace(/[\s-]/g, "").toUpperCase();

export function idNumberProblem(type: IdType, number: string): FieldProblem | null {
  const normalized = normalizeIdNumber(number);
  if (!normalized) return "required";
  if (type === "nida") return /^\d{20}$/.test(normalized) ? null : "nida";
  return /^[A-Z0-9]{5,20}$/.test(normalized) ? null : "id_number";
}

export type CategoryDetails = {
  profession?: string;
  certifications?: string;
  businessName?: string;
  sectorId?: string;
  building?: string;
  description?: string;
};

export type RegistrationDraft = {
  fullName?: string;
  regionId?: string;
  districtId?: string;
  address?: string;
  study?: { institution?: string; course?: string; year?: number };
  category?: MemberCategory;
  categoryDetails?: CategoryDetails;
  idType?: IdType;
  idExpiresOn?: string;
  identitySaved?: boolean;
  facePhoto?: boolean;
  idPhoto?: boolean;
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
};

export const WIZARD_STEPS = 6;

const blank = (value: string | undefined) => !value || !value.trim();

/** The fields each category asks for on step 3, and which of them are required. */
export const categoryFields: Record<
  MemberCategory,
  { field: keyof CategoryDetails; required: boolean }[]
> = {
  professional: [
    { field: "profession", required: true },
    { field: "certifications", required: false },
  ],
  businessperson: [
    { field: "businessName", required: true },
    { field: "sectorId", required: true },
  ],
  entrepreneur: [
    { field: "building", required: true },
    { field: "sectorId", required: true },
  ],
  other: [{ field: "description", required: true }],
};

/** What still blocks a wizard step: field name to problem. An empty object means the step is done. */
export function stepProblems(step: number, draft: RegistrationDraft): Record<string, FieldProblem> {
  const problems: Record<string, FieldProblem> = {};
  if (step === 1) {
    if (blank(draft.fullName)) problems.fullName = "required";
    if (!draft.regionId) problems.regionId = "required";
    if (!draft.districtId) problems.districtId = "required";
    if (blank(draft.address)) problems.address = "required";
    const study = draft.study;
    if (study && (study.course || study.year) && blank(study.institution))
      problems["study.institution"] = "required";
    if (study?.year !== undefined && !(study.year >= 1 && study.year <= 10))
      problems["study.year"] = "study_year";
  }
  if (step === 2 && !draft.category) problems.category = "required";
  if (step === 3) {
    if (!draft.category) problems.category = "required";
    else
      for (const { field, required } of categoryFields[draft.category])
        if (required && blank(draft.categoryDetails?.[field]))
          problems[`categoryDetails.${field}`] = "required";
  }
  if (step === 4) {
    if (!draft.idType) problems.idType = "required";
    if (!draft.identitySaved) problems.idNumber = "required";
    if (!draft.facePhoto) problems.facePhoto = "required";
    if (!draft.idPhoto) problems.idPhoto = "required";
  }
  if (step === 5) {
    if (!draft.acceptTerms) problems.acceptTerms = "required";
    if (!draft.acceptPrivacy) problems.acceptPrivacy = "required";
  }
  return problems;
}

/** The first step that still has a problem, or null when the draft can be submitted. */
export function firstIncompleteStep(draft: RegistrationDraft): number | null {
  for (let step = 1; step < WIZARD_STEPS; step++)
    if (Object.keys(stepProblems(step, draft)).length) return step;
  return null;
}

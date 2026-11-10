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

/** The categories a new registration ticks, as many as apply (decided 10 Nov 2026, #161). Entrepreneur stays only for members who registered before. */
export const selectableCategories: readonly MemberCategory[] = [
  "professional",
  "businessperson",
  "other",
];

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
  const email = emailProblem(input.email);
  if (email) problems.email = email;
  if (!input.phone.trim()) problems.phone = "required";
  else if (!normalizePhone(input.phone)) problems.phone = "phone";
  const password = passwordProblem(input.password);
  if (password) problems.password = password;
  return problems;
}

export function emailProblem(email: string): FieldProblem | null {
  if (!email.trim()) return "required";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? null : "email";
}

/** At least 8 characters with a digit, for members and staff alike. */
export function passwordProblem(password: string): FieldProblem | null {
  if (!password) return "required";
  return password.length < 8 || !/\d/.test(password) ? "password" : null;
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
  categories?: MemberCategory[];
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

/** The categories a draft ticks: its list, or the one category of a draft saved before 10 Nov 2026. */
export function draftCategories(draft: RegistrationDraft): MemberCategory[] {
  if (draft.categories && draft.categories.length > 0) return [...new Set(draft.categories)];
  return draft.category ? [draft.category] : [];
}

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
  const categories = draftCategories(draft);
  if (
    step === 2 &&
    (categories.length === 0 || categories.some((c) => !selectableCategories.includes(c)))
  )
    problems.category = "required";
  if (step === 3) {
    if (categories.length === 0) problems.category = "required";
    for (const category of categories)
      for (const { field, required } of categoryFields[category])
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

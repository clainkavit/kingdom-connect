import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  firstIncompleteStep,
  nextVerifyStep,
  previousVerifyStep,
  shownStepNumber,
  verifyProgress,
  VERIFY_STEPS,
  idNumberProblem,
  photoProblem,
  PHOTO_MAX_BYTES,
  normalizePhone,
  type RegistrationDraft,
  signUpProblems,
  stepProblems,
} from "./registration-rules";
import { functionCopies } from "../scripts/function-copies";

describe("normalizePhone (+255 only, PRD section 6)", () => {
  it("accepts the usual ways of writing a Tanzanian mobile number", () => {
    expect(normalizePhone("+255 712 345 678")).toBe("+255712345678");
    expect(normalizePhone("255712345678")).toBe("+255712345678");
    expect(normalizePhone("0712 345 678")).toBe("+255712345678");
  });

  it("refuses other numbers", () => {
    expect(normalizePhone("+254712345678")).toBeNull();
    expect(normalizePhone("071234567")).toBeNull();
  });
});

describe("signUpProblems (S02)", () => {
  const good = {
    username: "test_user",
    email: "test.user@example.test",
    phone: "0712345678",
    password: "secret123",
  };

  it("passes a complete sign-up", () => {
    expect(signUpProblems(good)).toEqual({});
  });

  it("names each problem", () => {
    expect(
      signUpProblems({ username: "a!", email: "nope", phone: "+254712345678", password: "short" }),
    ).toEqual({ username: "username", email: "email", phone: "phone", password: "password" });
    expect(signUpProblems({ ...good, password: "nonumbers" }).password).toBe("password");
    expect(signUpProblems({ username: "", email: "", phone: "", password: "" })).toEqual({
      username: "required",
      email: "required",
      phone: "required",
      password: "required",
    });
  });
});

describe("idNumberProblem", () => {
  it("needs exactly 20 digits for NIDA", () => {
    expect(idNumberProblem("nida", "1990 0101 1234 5678 9012")).toBeNull();
    expect(idNumberProblem("nida", "1234")).toBe("nida");
  });

  it("accepts letters and digits for other IDs", () => {
    expect(idNumberProblem("passport", "ab123456")).toBeNull();
    expect(idNumberProblem("passport", "x")).toBe("id_number");
    expect(idNumberProblem("voters_id", "")).toBe("required");
  });
});

describe("wizard steps (S05)", () => {
  const complete: RegistrationDraft = {
    fullName: "Test Applicant",
    regionId: "r",
    districtId: "d",
    address: "Plot 1",
    category: "professional",
    categoryDetails: { profession: "Accountant" },
    idType: "nida",
    identitySaved: true,
    facePhoto: true,
    idPhoto: true,
    acceptTerms: true,
    acceptPrivacy: true,
  };

  it("lets a complete draft be submitted", () => {
    expect(firstIncompleteStep(complete)).toBeNull();
  });

  it("sends the applicant back to the first unfinished step", () => {
    expect(firstIncompleteStep({ ...complete, address: " " })).toBe(1);
    expect(firstIncompleteStep({ ...complete, idPhoto: false })).toBe(4);
  });

  it("does not ask for the terms in the steps: they are accepted when the account is made (R28)", () => {
    expect(
      firstIncompleteStep({ ...complete, acceptTerms: false, acceptPrivacy: false }),
    ).toBeNull();
  });

  it("shows five steps in the profile: about you, what you do, your work, ID and photos, check and send", () => {
    expect(VERIFY_STEPS).toEqual([1, 2, 3, 4, 6]);
    expect(VERIFY_STEPS.map(shownStepNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(nextVerifyStep(4)).toBe(6);
    expect(previousVerifyStep(6)).toBe(4);
    expect(nextVerifyStep(1)).toBe(2);
    expect(previousVerifyStep(2)).toBe(1);
  });

  it("asks an account with no phone yet for one in About you, in the +255 form", () => {
    const aboutYou = {
      fullName: "A",
      regionId: "r",
      districtId: "d",
      address: "Plot 1",
      needsPhone: true,
    };
    expect(stepProblems(1, aboutYou)).toEqual({ phone: "phone" });
    expect(stepProblems(1, { ...aboutYou, phone: "0712 345 678" })).toEqual({});
    expect(stepProblems(1, { ...aboutYou, phone: "12345" })).toEqual({ phone: "phone" });
  });

  it("counts the steps done for the Home banner (S08)", () => {
    expect(verifyProgress({})).toBe(0);
    expect(
      verifyProgress({ fullName: "A", regionId: "r", districtId: "d", address: "Plot 1" }),
    ).toBe(1);
    expect(verifyProgress(complete)).toBe(4);
  });

  it("lets a member tick several categories and asks for the details of each (#161)", () => {
    expect(stepProblems(2, { categories: ["professional", "businessperson"] })).toEqual({});
    expect(
      stepProblems(3, {
        categories: ["professional", "businessperson"],
        categoryDetails: { profession: "Accountant" },
      }),
    ).toEqual({
      "categoryDetails.businessName": "required",
      "categoryDetails.sectorId": "required",
    });
  });

  it("no longer offers Entrepreneur to a new registration (#161)", () => {
    expect(stepProblems(2, { categories: ["entrepreneur"] })).toEqual({ category: "required" });
    expect(stepProblems(2, { categories: [] })).toEqual({ category: "required" });
  });

  it("asks for the details that fit the category", () => {
    expect(stepProblems(3, { category: "businessperson", categoryDetails: {} })).toEqual({
      "categoryDetails.businessName": "required",
      "categoryDetails.sectorId": "required",
    });
    expect(
      stepProblems(3, { category: "other", categoryDetails: { description: "Farmer" } }),
    ).toEqual({});
  });

  it("needs an institution when study details are given", () => {
    expect(stepProblems(1, { ...complete, study: { course: "BCom", year: 2 } })).toEqual({
      "study.institution": "required",
    });
    expect(stepProblems(1, { ...complete, study: { institution: "X", year: 12 } })).toEqual({
      "study.year": "study_year",
    });
  });
});

describe("the Edge Functions copy (pnpm generate)", () => {
  it("matches packages/shared", () => {
    for (const copy of functionCopies) {
      const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      expect(read(copy.to), copy.to).toBe(read(copy.from));
    }
  });
});

describe("photoProblem (S05 ID and photos)", () => {
  it("accepts a JPEG, PNG or WebP up to 5 MB", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"])
      expect(photoProblem({ mimeType, size: PHOTO_MAX_BYTES })).toBeNull();
  });

  it("refuses a type the identity store does not take, such as an iPhone HEIC or a PDF", () => {
    expect(photoProblem({ mimeType: "image/heic", size: 1000 })).toBe("photo_type");
    expect(photoProblem({ mimeType: "application/pdf", size: 1000 })).toBe("photo_type");
  });

  it("refuses a photo over 5 MB", () => {
    expect(photoProblem({ mimeType: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe("photo_size");
  });

  it("leaves an unknown type or size to the upload", () => {
    expect(photoProblem({ mimeType: null, size: null })).toBeNull();
    expect(photoProblem({})).toBeNull();
  });
});

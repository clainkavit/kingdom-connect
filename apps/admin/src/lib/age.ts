import { waitingAge, type Strings } from "@kingdom-connect/shared";

/** How long an application has waited, in hours under a day and days after. */
export function ageText(t: Strings, submittedAt: Date, now: Date): string {
  const age = waitingAge(submittedAt, now);
  if (age.unit === "days") return t.ageDays(age.value);
  return age.value === 0 ? t.ageUnderHour : t.ageHours(age.value);
}

export type NotificationLanguage = "en" | "sw";

export const notificationCategories = [
  "account",
  "security",
  "admin_actions",
  "business",
  "connections",
  "messages",
  "opportunities",
  "ideas",
  "plans",
  "matches",
  "learning",
  "reports",
  "investor",
] as const;

export type NotificationCategory = (typeof notificationCategories)[number];

/** Always emailed; members cannot switch these off (PRD section 14, decided 2 Nov 2026). */
export const criticalCategories: readonly NotificationCategory[] = [
  "account",
  "security",
  "admin_actions",
];

/** The categories with an email switch in S46. Report outcomes are in-app only. */
export const emailSwitchCategories: readonly NotificationCategory[] = notificationCategories.filter(
  (c) => !criticalCategories.includes(c) && c !== "reports",
);

export type EmailChannel = "yes" | "digest" | "weekly" | "no";

export type NotificationText = { title: string; message: string; push?: string; digest?: string };

export type NotificationCopy = {
  category: NotificationCategory;
  inApp: boolean;
  email: EmailChannel;
  push: boolean;
  opens: string;
  en: NotificationText;
  sw: NotificationText;
};

const categoryByCode: [RegExp, NotificationCategory][] = [
  [/^A\d+$/, "account"],
  [/^B\d+$/, "business"],
  [/^C[12]$/, "connections"],
  [/^C3$/, "messages"],
  [/^O\d+$/, "opportunities"],
  [/^I\d+$/, "ideas"],
  [/^P\d+$/, "plans"],
  [/^S\d+$/, "matches"],
  [/^[TW]\d+$/, "learning"],
  [/^R\d+$/, "reports"],
  [/^V\d+$/, "investor"],
  [/^(L1|X1)$/, "security"],
  [/^(X2|H\d+)$/, "admin_actions"],
];

export function categoryOfCode(code: string): NotificationCategory {
  const match = categoryByCode.find(([pattern]) => pattern.test(code));
  if (!match) throw new Error(`No notification category for ${code}`);
  return match[1];
}

/** docs/screens.md, Notification to screen, as member app paths. */
const opensByCode: [RegExp, string][] = [
  [/^A5$/, "/verify"],
  [/^(L1|X1)$/, "/login"],
  [/^A\d+$/, "/status"],
  [/^B\d+$/, "/settings"],
  [/^C[12]$/, "/connections"],
  [/^C3$/, "/messages"],
  [/^[OX]\d+$/, "/opportunities"],
  [/^[IH]\d+$/, "/ideas"],
  [/^P\d+$/, "/ideas"],
  [/^S\d+$/, "/opportunities"],
  [/^[TW]\d+$/, "/training"],
  [/^R\d+$/, "/reports"],
  [/^V\d+$/, "/ideas"],
];

export function opensForCode(code: string): string {
  return opensByCode.find(([pattern]) => pattern.test(code))?.[1] ?? "/";
}

export type NotificationValues = Record<string, string | number>;

/** Fills {placeholders}; one with no value stays as written so a gap is visible in tests. */
export function fillTemplate(template: string, values: NotificationValues): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function emailWanted(
  copy: Pick<NotificationCopy, "category" | "email">,
  emailSwitchedOn: boolean,
): boolean {
  if (copy.email === "no") return false;
  if (criticalCategories.includes(copy.category)) return true;
  return emailSwitchedOn;
}

export function notificationText(
  copy: Pick<NotificationCopy, "en" | "sw">,
  language: NotificationLanguage,
  values: NotificationValues,
): NotificationText {
  const text = copy[language];
  return {
    title: fillTemplate(text.title, values),
    message: fillTemplate(text.message, values),
    ...(text.push ? { push: fillTemplate(text.push, values) } : {}),
    ...(text.digest ? { digest: fillTemplate(text.digest, values) } : {}),
  };
}

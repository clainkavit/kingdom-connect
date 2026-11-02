import { en } from "./en";
import { sw } from "./sw";

export type Language = "en" | "sw";

type Widen<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : string;
};

/** Every screen string. Kiswahili must have the same keys, so a missing one fails typecheck. */
export type Strings = Widen<typeof en>;

/** Keys whose value is plain text, for menus and titles. */
export type TextKey = {
  [K in keyof Strings]: Strings[K] extends string ? K : never;
}[keyof Strings];

const dictionaries: Record<Language, Strings> = { en, sw };

export const stringsFor = (language: Language): Strings => dictionaries[language];

export const languages: readonly { code: Language; name: string }[] = [
  { code: "en", name: "English" },
  { code: "sw", name: "Kiswahili" },
];

export const isLanguage = (value: unknown): value is Language => value === "en" || value === "sw";

const locale = (language: Language) => (language === "sw" ? "sw-TZ" : "en-TZ");

export function formatDate(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(locale(language), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Dar_es_Salaam",
  }).format(date);
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(locale(language)).format(value);
}

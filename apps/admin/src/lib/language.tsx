"use client";

import { isLanguage, stringsFor, type Language, type Strings } from "@kingdom-connect/shared";
import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

const LANGUAGE_KEY = "kc.language";
const PLATFORM_NAME_KEY = "kc.platformName";

export type LanguageState = {
  language: Language;
  t: Strings;
  platformName: string;
  setLanguage: (language: Language) => void;
};

export const LanguageContext = createContext<LanguageState>({
  language: "en",
  t: stringsFor("en"),
  platformName: "",
  setLanguage: () => {},
});

export const useLanguage = () => useContext(LanguageContext);

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

const notify = () => listeners.forEach((listener) => listener());

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    return notify();
  }
  notify();
}

const savedLanguage = (): Language => {
  const value = read(LANGUAGE_KEY);
  return isLanguage(value) ? value : "en";
};
const savedPlatformName = () => read(PLATFORM_NAME_KEY) ?? "";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribe, savedLanguage, () => "en" as const);
  const platformName = useSyncExternalStore(subscribe, savedPlatformName, () => "");
  const t = stringsFor(language);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "platform_name")
      .maybeSingle()
      .then(({ data }) => {
        if (typeof data?.value === "string") write(PLATFORM_NAME_KEY, data.value);
      });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    if (platformName) document.title = t.adminTitle(platformName);
  }, [language, platformName, t]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        t,
        platformName,
        setLanguage: (next) => write(LANGUAGE_KEY, next),
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

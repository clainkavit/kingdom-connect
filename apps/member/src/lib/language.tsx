import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isLanguage,
  routeFor,
  stringsFor,
  type Language,
  type Strings,
} from "@kingdom-connect/shared";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "./auth";
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

async function signedInMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || routeFor(session.access_token, "member") !== "app") return null;
  return session.user.id;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [language, setLanguageState] = useState<Language>("en");
  const [platformName, setPlatformName] = useState("");
  const fromAccount = useRef(false);
  const chosenBeforeSignIn = useRef<Language | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then((saved) => {
      if (isLanguage(saved) && !fromAccount.current) setLanguageState(saved);
    });
    AsyncStorage.getItem(PLATFORM_NAME_KEY).then((saved) => {
      if (saved) setPlatformName((current) => current || saved);
    });
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "platform_name")
      .maybeSingle()
      .then(({ data }) => {
        if (typeof data?.value !== "string") return;
        setPlatformName(data.value);
        AsyncStorage.setItem(PLATFORM_NAME_KEY, data.value);
      });
  }, []);

  useEffect(() => {
    if (routeFor(accessToken, "member") !== "app") {
      fromAccount.current = false;
      return;
    }
    signedInMemberId().then(async (memberId) => {
      if (!memberId) return;
      fromAccount.current = true;
      const chosen = chosenBeforeSignIn.current;
      chosenBeforeSignIn.current = null;
      if (chosen) {
        await supabase.rpc("set_my_language", { chosen });
        return;
      }
      const { data } = await supabase.rpc("my_language");
      if (!isLanguage(data)) return;
      setLanguageState(data);
      AsyncStorage.setItem(LANGUAGE_KEY, data);
    });
  }, [accessToken]);

  useEffect(() => {
    if (Platform.OS === "web") document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    AsyncStorage.setItem(LANGUAGE_KEY, next);
    if (routeFor(accessToken, "member") !== "app") chosenBeforeSignIn.current = next;
    signedInMemberId().then(async (memberId) => {
      if (memberId) await supabase.rpc("set_my_language", { chosen: next });
    });
  };

  return (
    <LanguageContext.Provider
      value={{ language, t: stringsFor(language), platformName, setLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

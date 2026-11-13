import { languages } from "@kingdom-connect/shared";
import Globe from "lucide-react-native/icons/globe";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { usePalette } from "./palette";

/** The top bar's language control: a globe with the current language, opening a short list to pick from. */
export function LanguageMenu() {
  const { language, t, setLanguage } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  return (
    <View className="relative">
      <Pressable
        role="button"
        aria-label={t.changeLanguage}
        aria-expanded={open}
        aria-haspopup="menu"
        onPress={() => setOpen((o) => !o)}
        className="min-h-[40px] flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3"
      >
        <Globe size={16} color={palette.ink} aria-hidden />
        <Text className="font-figtree-bold text-[13px] text-ink">{language.toUpperCase()}</Text>
      </Pressable>
      {open ? (
        <View
          role="menu"
          aria-label={t.language}
          style={{ position: "absolute", top: 46, right: 0, zIndex: 20 }}
          className="min-w-[150px] rounded-card border border-line bg-surface py-1.5 shadow-md"
        >
          {languages.map((option) => {
            const chosen = option.code === language;
            return (
              <Pressable
                key={option.code}
                role="menuitem"
                aria-checked={chosen}
                aria-label={option.name}
                onPress={() => {
                  setOpen(false);
                  if (!chosen) setLanguage(option.code);
                }}
                className="min-h-[44px] flex-row items-center justify-between gap-3 px-4"
              >
                <Text
                  className={`text-sm ${chosen ? "font-figtree-bold text-blue" : "font-figtree text-ink"}`}
                >
                  {option.name}
                </Text>
                {chosen ? (
                  <Text aria-hidden className="font-figtree-bold text-sm text-blue">
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

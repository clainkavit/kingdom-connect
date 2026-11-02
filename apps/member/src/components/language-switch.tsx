import { languages } from "@kingdom-connect/shared";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";

export function LanguageSwitch({ onNavy }: { onNavy?: boolean }) {
  const { language, t, setLanguage } = useLanguage();
  const idle = onNavy ? "text-navy-ink" : "text-ink-2";
  const active = onNavy ? "text-white" : "text-blue";
  return (
    <View role="group" aria-label={t.language} className="flex-row items-center">
      {languages.map((option, i) => (
        <View key={option.code} className="flex-row items-center">
          {i > 0 ? (
            <Text aria-hidden className={`font-figtree text-sm ${idle}`}>
              ·
            </Text>
          ) : null}
          <Pressable
            role="button"
            aria-pressed={option.code === language}
            onPress={() => setLanguage(option.code)}
            className="min-h-[44px] justify-center px-2"
          >
            <Text
              className={`text-sm ${option.code === language ? `font-figtree-bold ${active}` : `font-figtree ${idle}`}`}
            >
              {option.name}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

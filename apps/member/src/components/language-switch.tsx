import { languages } from "@kingdom-connect/shared";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";

export function LanguageSwitch({ onNavy, pill }: { onNavy?: boolean; pill?: boolean }) {
  const { language, t, setLanguage } = useLanguage();
  if (pill)
    return (
      <View
        role="group"
        aria-label={t.language}
        className="flex-row items-center rounded-full border border-line bg-surface p-1"
      >
        {languages.map((option) => {
          const on = option.code === language;
          return (
            <Pressable
              key={option.code}
              role="button"
              aria-label={option.name}
              aria-pressed={on}
              onPress={() => setLanguage(option.code)}
              className={`h-9 min-w-[44px] items-center justify-center rounded-full px-3 ${on ? "bg-navy" : ""}`}
            >
              <Text className={`font-figtree-bold text-[13px] ${on ? "text-white" : "text-ink-2"}`}>
                {option.code.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
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

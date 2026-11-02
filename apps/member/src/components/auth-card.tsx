import { Pressable, ScrollView, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { LanguageSwitch } from "./language-switch";

export function AuthCard({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { platformName } = useLanguage();
  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row flex-wrap items-center justify-between gap-3 bg-navy px-7 py-1.5">
        <Text className="font-figtree-extrabold text-[19px] text-white">{platformName}</Text>
        <LanguageSwitch onNavy />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center justify-center px-4 py-7"
      >
        <View
          role="main"
          className={`w-full gap-3 rounded-card border border-line bg-surface p-[18px] ${wide ? "max-w-[720px]" : "max-w-[400px]"}`}
        >
          <Text role="heading" aria-level={1} className="font-figtree-extrabold text-lg text-ink">
            {title}
          </Text>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      className="min-h-[44px] justify-center self-start"
    >
      <Text className="font-figtree-semibold text-sm text-blue">{label}</Text>
    </Pressable>
  );
}

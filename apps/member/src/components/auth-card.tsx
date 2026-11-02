import { Pressable, ScrollView, Text, View } from "react-native";
import { strings } from "../strings";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-bg">
      <View className="bg-navy px-7 py-3.5">
        <Text className="font-figtree-extrabold text-[19px] text-white">{strings.appName}</Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center justify-center px-4 py-7"
      >
        <View
          role="main"
          className="w-full max-w-[400px] gap-3 rounded-card border border-line bg-surface p-[18px]"
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

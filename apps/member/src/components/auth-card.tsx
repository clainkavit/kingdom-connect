import { Pressable, ScrollView, Text, View } from "react-native";
import { strings } from "../strings";
import { NavIcon } from "./nav-icon";
import { usePalette } from "./palette";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="flex-grow items-center justify-center p-4"
    >
      <View className="w-full max-w-sm gap-6 rounded-card border border-line bg-surface p-6">
        <View className="flex-row items-center gap-2.5">
          <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-blue">
            <NavIcon name="users" size={20} color={palette.blueInk} />
          </View>
          <Text className="font-figtree-extrabold text-lg text-ink">{strings.appName}</Text>
        </View>
        <Text role="heading" aria-level={1} className="font-figtree-bold text-xl text-ink">
          {title}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} className="self-start">
      <Text className="font-figtree-medium text-sm text-blue">{label}</Text>
    </Pressable>
  );
}

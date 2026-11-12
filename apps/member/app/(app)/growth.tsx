import { Text, View } from "react-native";
import { GrowthList, ScreenTitle } from "../../src/components/screens";
import { useLanguage } from "../../src/lib/language";

export default function GrowthScreen() {
  const { t } = useLanguage();
  return (
    <View className="gap-4">
      <ScreenTitle>{t.navGrowth}</ScreenTitle>
      <Text className="font-figtree text-[15px] leading-6 text-ink-2">{t.growthIntro}</Text>
      <GrowthList />
    </View>
  );
}

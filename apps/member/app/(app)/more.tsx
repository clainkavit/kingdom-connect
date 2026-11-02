import { Text, View } from "react-native";
import { TextButton } from "../../src/components/auth-card";
import { LanguageSwitch } from "../../src/components/language-switch";
import { MoreList, ScreenTitle } from "../../src/components/screens";
import { useAuth } from "../../src/lib/auth";
import { useLanguage } from "../../src/lib/language";

export default function MoreScreen() {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  return (
    <>
      <ScreenTitle>{t.tabMore}</ScreenTitle>
      <MoreList />
      <View className="mt-4 flex-row items-center justify-between rounded-card border border-line bg-surface px-4">
        <Text className="font-figtree text-[15px] text-ink">{t.language}</Text>
        <LanguageSwitch />
      </View>
      <View className="mt-4">
        <TextButton label={t.logOut} onPress={signOut} />
      </View>
    </>
  );
}

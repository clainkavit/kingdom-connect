import { View } from "react-native";
import { TextButton } from "../../src/components/auth-card";
import { MoreList, ScreenTitle } from "../../src/components/screens";
import { useAuth } from "../../src/lib/auth";
import { strings } from "../../src/strings";

export default function MoreScreen() {
  const { signOut } = useAuth();
  return (
    <>
      <ScreenTitle>{strings.more}</ScreenTitle>
      <MoreList />
      <View className="mt-4">
        <TextButton label={strings.logOut} onPress={signOut} />
      </View>
    </>
  );
}

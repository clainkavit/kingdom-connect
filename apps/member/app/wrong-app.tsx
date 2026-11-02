import { Text } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { Guard, useAuth } from "../src/lib/auth";
import { strings } from "../src/strings";

export default function WrongAppScreen() {
  const { signOut } = useAuth();
  return (
    <Guard route="wrong_app">
      <AuthCard title={strings.appName}>
        <Text className="font-figtree text-sm text-ink-2">{strings.wrongApp}</Text>
        <TextButton label={strings.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

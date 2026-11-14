import { Text } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { openAdminConsole } from "../src/components/role-choice";
import { adminUrl } from "../src/lib/admin-url";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";

export default function WrongAppScreen() {
  const { signOut } = useAuth();
  const { t, platformName } = useLanguage();
  return (
    <Guard route="wrong_app">
      <AuthCard title={platformName}>
        <Text className="font-figtree text-sm text-ink-2">{t.wrongAppMember}</Text>
        {adminUrl && (
          <TextButton
            label={t.openAdminConsole}
            onPress={() => void signOut().finally(() => openAdminConsole())}
          />
        )}
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

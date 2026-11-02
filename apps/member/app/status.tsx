import { userStatusOf } from "@kingdom-connect/shared";
import { Text, View } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";

export default function StatusScreen() {
  const { accessToken, signOut } = useAuth();
  const { t } = useLanguage();
  const rejected = accessToken ? userStatusOf(accessToken) === "rejected" : false;
  return (
    <Guard route="status">
      <AuthCard title={t.statusTitle}>
        <View className={`gap-1.5 rounded-card p-4 ${rejected ? "bg-bad-soft" : "bg-warn-soft"}`}>
          <Text
            className={`font-figtree-extrabold text-base ${rejected ? "text-bad-text" : "text-warn-text"}`}
          >
            {rejected ? t.rejectedStatusTitle : t.pendingStatusTitle}
          </Text>
          <Text
            className={`font-figtree text-sm leading-5 ${rejected ? "text-bad-text" : "text-warn-text"}`}
          >
            {rejected ? t.rejectedStatus : t.pendingStatus}
          </Text>
        </View>
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

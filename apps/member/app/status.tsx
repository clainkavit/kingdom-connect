import { userStatusOf } from "@kingdom-connect/shared";
import { Text, View } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { Guard, useAuth } from "../src/lib/auth";
import { strings } from "../src/strings";

export default function StatusScreen() {
  const { accessToken, signOut } = useAuth();
  const rejected = accessToken ? userStatusOf(accessToken) === "rejected" : false;
  return (
    <Guard route="status">
      <AuthCard title={strings.statusTitle}>
        <View className={`gap-1.5 rounded-card p-4 ${rejected ? "bg-bad-soft" : "bg-warn-soft"}`}>
          <Text
            className={`font-figtree-extrabold text-base ${rejected ? "text-bad-text" : "text-warn-text"}`}
          >
            {rejected ? strings.rejectedStatusTitle : strings.pendingStatusTitle}
          </Text>
          <Text
            className={`font-figtree text-sm leading-5 ${rejected ? "text-bad-text" : "text-warn-text"}`}
          >
            {rejected ? strings.rejectedStatus : strings.pendingStatus}
          </Text>
        </View>
        <TextButton label={strings.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

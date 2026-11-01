import { userStatusOf } from "@kingdom-connect/shared";
import { Text } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { Guard, useAuth } from "../src/lib/auth";
import { strings } from "../src/strings";

export default function StatusScreen() {
  const { accessToken, signOut } = useAuth();
  const rejected = accessToken ? userStatusOf(accessToken) === "rejected" : false;
  return (
    <Guard route="status">
      <AuthCard title={strings.statusTitle}>
        <Text className="font-figtree text-sm text-ink-2">
          {rejected ? strings.rejectedStatus : strings.pendingStatus}
        </Text>
        <TextButton label={strings.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

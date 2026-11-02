import { Slot } from "expo-router";
import { MemberShell } from "../../src/components/shell";
import { Guard, useAuth } from "../../src/lib/auth";

export default function AppLayout() {
  const { signOut } = useAuth();
  return (
    <Guard route="app">
      <MemberShell onSignOut={signOut}>
        <Slot />
      </MemberShell>
    </Guard>
  );
}

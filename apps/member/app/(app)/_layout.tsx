import { Slot, usePathname } from "expo-router";
import { LegalGate } from "../../src/components/legal-gate";
import { MemberShell } from "../../src/components/shell";
import { Guard } from "../../src/lib/auth";
import { useUnreadCount } from "../../src/lib/notifications";

export default function AppLayout() {
  const unread = useUnreadCount(usePathname());
  return (
    <Guard route="app">
      <LegalGate>
        <MemberShell unread={unread}>
          <Slot />
        </MemberShell>
      </LegalGate>
    </Guard>
  );
}

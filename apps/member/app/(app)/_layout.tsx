import { Slot, usePathname } from "expo-router";
import { LegalGate } from "../../src/components/legal-gate";
import { MemberShell } from "../../src/components/shell";
import { Guard } from "../../src/lib/auth";
import { useUnreadCount, useUnreadMessages } from "../../src/lib/notifications";

export default function AppLayout() {
  const pathname = usePathname();
  const unread = useUnreadCount(pathname);
  const unreadMessages = useUnreadMessages(pathname);
  return (
    <Guard route="app">
      <LegalGate>
        <MemberShell unread={unread} unreadMessages={unreadMessages}>
          <Slot />
        </MemberShell>
      </LegalGate>
    </Guard>
  );
}

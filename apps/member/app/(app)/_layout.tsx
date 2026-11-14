import { Slot, usePathname } from "expo-router";
import { LegalGate } from "../../src/components/legal-gate";
import { MemberShell } from "../../src/components/shell";
import { Guard } from "../../src/lib/auth";
import { useUnreadCount, useUnreadMessages } from "../../src/lib/notifications";

export default function AppLayout() {
  return (
    <Guard route="app">
      <SignedInShell />
    </Guard>
  );
}

/**
 * Rendered only once Guard has let a signed-in member through, so the unread counts are never
 * asked for by a signed-out visitor (audit M2: they returned 401 on every visit to /login).
 */
function SignedInShell() {
  const pathname = usePathname();
  const unread = useUnreadCount(pathname);
  const unreadMessages = useUnreadMessages(pathname);
  return (
    <LegalGate>
      <MemberShell unread={unread} unreadMessages={unreadMessages}>
        <Slot />
      </MemberShell>
    </LegalGate>
  );
}

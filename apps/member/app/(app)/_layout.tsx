import { isLooking } from "@kingdom-connect/shared";
import { Slot, usePathname } from "expo-router";
import { LegalGate } from "../../src/components/legal-gate";
import { LookGate, LookProvider } from "../../src/components/look";
import { MemberShell } from "../../src/components/shell";
import { Guard, useAuth } from "../../src/lib/auth";
import { useUnreadCount, useUnreadMessages } from "../../src/lib/notifications";
import { accessToken as currentToken } from "../../src/lib/registration";
import { registrationClient, supabase } from "../../src/lib/supabase";

const applicationStatus = async () => registrationClient.status(await currentToken());
const renewSignIn = () => supabase.auth.refreshSession();

/** Verified members, and applicants who look around without acting (R27, PRD section 3). */
export default function AppLayout() {
  return (
    <Guard route={["app", "status"]}>
      <LegalGate>
        <SignedIn />
      </LegalGate>
    </Guard>
  );
}

function SignedIn() {
  const pathname = usePathname();
  const { accessToken } = useAuth();
  const looking = isLooking(accessToken);
  const unread = useUnreadCount(pathname);
  const unreadMessages = useUnreadMessages(pathname);
  return (
    <LookProvider looking={looking} status={applicationStatus} onApproved={renewSignIn}>
      <MemberShell unread={unread} unreadMessages={unreadMessages}>
        <LookGate>
          <Slot />
        </LookGate>
      </MemberShell>
    </LookProvider>
  );
}

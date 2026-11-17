import { Redirect, useRouter } from "expo-router";
import { PhoneSignIn } from "../src/components/phone-sign-in";
import { Guard, useAuth } from "../src/lib/auth";
import { loginClient, phoneSignIn } from "../src/lib/supabase";

export default function PhoneSignInScreen() {
  const { startSession, finishSignIn } = useAuth();
  const router = useRouter();
  if (!phoneSignIn) return <Redirect href="/sign-up" />;
  return (
    <Guard route="login">
      <PhoneSignIn
        client={loginClient}
        onAnotherWay={() => router.replace("/sign-up")}
        onSignedIn={async (session) => {
          await startSession(session, 60);
          await finishSignIn();
        }}
      />
    </Guard>
  );
}

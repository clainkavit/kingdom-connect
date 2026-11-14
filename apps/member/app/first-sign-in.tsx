import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { FirstSignIn } from "../src/components/first-sign-in";
import { Guard, useAuth } from "../src/lib/auth";
import { firstSignInApi } from "../src/lib/first-sign-in";
import { useLanguage } from "../src/lib/language";
import { legalEntityName } from "../src/lib/legal";

/** S01a: the first sign-in with Google, before the account exists (R26). */
export default function FirstSignInScreen() {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [entityName, setEntityName] = useState("");
  const api = useMemo(
    () => ({
      ...firstSignInApi,
      done: async () => {
        await firstSignInApi.done();
        router.replace("/");
      },
    }),
    [router],
  );
  useEffect(() => {
    legalEntityName().then(setEntityName);
  }, []);
  return (
    <Guard route={["first", "status"]}>
      <AuthCard wide title={t.firstTitle}>
        <FirstSignIn api={api} entityName={entityName} />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    </Guard>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";
import { acceptTexts, legalEntityName, usePendingTexts } from "../lib/legal";
import { AuthCard, TextButton } from "./auth-card";
import { AcceptTexts } from "./legal";
import { ErrorState } from "./states";

/** Blocks the app until the Member accepts changed terms of use and privacy notice (S07). */
export function LegalGate({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const { pending, failed, reload } = usePendingTexts();
  const [entityName, setEntityName] = useState("");

  useEffect(() => {
    legalEntityName().then(setEntityName);
  }, []);

  if (failed) {
    return (
      <AuthCard title={t.acceptUpdatedTitle}>
        <ErrorState message={t.network} onRetry={reload} />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    );
  }
  if (pending === null) return null;
  if (pending.length === 0) return <>{children}</>;
  return (
    <AuthCard wide title={t.acceptUpdatedTitle}>
      <AcceptTexts
        texts={pending}
        entityName={entityName}
        onAccept={async (ids) => {
          await acceptTexts(ids);
          reload();
        }}
      />
      <TextButton label={t.logOut} onPress={signOut} />
    </AuthCard>
  );
}

import type { ApplicationStatus } from "@kingdom-connect/shared";
import { useEffect, useMemo, useState } from "react";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { RegistrationStatus } from "../src/components/registration-status";
import { RegistrationWizard } from "../src/components/registration-wizard";
import { ErrorState } from "../src/components/states";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";
import { legalEntityName } from "../src/lib/legal";
import { accessToken, loadDraft, type SavedDraft } from "../src/lib/registration";
import { registrationClient, supabase } from "../src/lib/supabase";
import { wizardApi } from "../src/lib/wizard-api";

type Loaded = { status: ApplicationStatus; draft: SavedDraft | null };

async function loadRegistration(): Promise<Loaded> {
  const status = await registrationClient.status(await accessToken());
  return { status, draft: status.kind === "drafting" ? await loadDraft() : null };
}

/** S05 while the application is being written, otherwise S06. */
function Registration() {
  const { signOut } = useAuth();
  const { t, language } = useLanguage();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const [entityName, setEntityName] = useState("");
  const api = useMemo(() => wizardApi(language), [language]);

  useEffect(() => {
    let live = true;
    loadRegistration().then(
      (next) => {
        if (!live) return;
        setFailed(next.status.kind === "network");
        setLoaded(next);
        if (next.status.kind === "approved") supabase.auth.refreshSession();
        if (next.status.kind === "signed_out") supabase.auth.signOut();
      },
      () => live && setFailed(true),
    );
    legalEntityName().then((name) => live && setEntityName(name));
    return () => {
      live = false;
    };
  }, [round]);

  const reload = () => {
    setFailed(false);
    setLoaded(null);
    setRound((r) => r + 1);
  };

  if (failed) {
    return (
      <AuthCard title={t.statusTitle}>
        <ErrorState message={t.statusLoadFailed} onRetry={reload} />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    );
  }
  if (!loaded) return null;
  const { status, draft } = loaded;

  if (status.kind === "drafting" && draft) {
    return (
      <AuthCard wide title={t.wizardTitle}>
        <RegistrationWizard
          initial={draft}
          api={api}
          entityName={entityName}
          onSubmitted={reload}
        />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    );
  }
  if (status.kind !== "under_review" && status.kind !== "rejected") return null;
  return (
    <AuthCard title={t.statusTitle}>
      <RegistrationStatus
        status={status}
        onResubmit={async () => {
          const ok = await registrationClient.startResubmission(await accessToken());
          if (ok) reload();
          return ok;
        }}
      />
      <TextButton label={t.logOut} onPress={signOut} />
    </AuthCard>
  );
}

export default function StatusScreen() {
  return (
    <Guard route="status">
      <Registration />
    </Guard>
  );
}

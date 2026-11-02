import { userStatusOf } from "@kingdom-connect/shared";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { ErrorState } from "../src/components/states";
import { RegistrationWizard } from "../src/components/registration-wizard";
import { Guard, useAuth } from "../src/lib/auth";
import { useLanguage } from "../src/lib/language";
import { legalEntityName } from "../src/lib/legal";
import { loadDraft, type SavedDraft } from "../src/lib/registration";
import { wizardApi } from "../src/lib/wizard-api";

function StatusCard({ rejected }: { rejected: boolean }) {
  const { t } = useLanguage();
  return (
    <View className={`gap-1.5 rounded-card p-4 ${rejected ? "bg-bad-soft" : "bg-warn-soft"}`}>
      <Text
        className={`font-figtree-extrabold text-base ${rejected ? "text-bad-text" : "text-warn-text"}`}
      >
        {rejected ? t.rejectedStatusTitle : t.pendingStatusTitle}
      </Text>
      <Text
        className={`font-figtree text-sm leading-5 ${rejected ? "text-bad-text" : "text-warn-text"}`}
      >
        {rejected ? t.rejectedStatus : t.pendingStatus}
      </Text>
    </View>
  );
}

/** S05 until the application is submitted, then S06. */
function Registration() {
  const { accessToken, signOut } = useAuth();
  const { t, language } = useLanguage();
  const rejected = accessToken ? userStatusOf(accessToken) === "rejected" : false;
  const [saved, setSaved] = useState<SavedDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const [entityName, setEntityName] = useState("");
  const api = useMemo(() => wizardApi(language), [language]);

  useEffect(() => {
    if (rejected) return;
    loadDraft()
      .then((draft) => {
        setFailed(false);
        setSaved(draft);
      })
      .catch(() => setFailed(true));
    legalEntityName().then(setEntityName);
  }, [rejected, round]);

  if (failed) {
    return (
      <AuthCard title={t.wizardTitle}>
        <ErrorState message={t.loadFailed} onRetry={() => setRound((r) => r + 1)} />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    );
  }

  if (!rejected && saved && !saved.submitted) {
    return (
      <AuthCard wide title={t.wizardTitle}>
        <RegistrationWizard
          initial={saved}
          api={api}
          entityName={entityName}
          onSubmitted={() => setSaved({ ...saved, submitted: true })}
        />
        <TextButton label={t.logOut} onPress={signOut} />
      </AuthCard>
    );
  }
  if (!rejected && !saved) return null;
  return (
    <AuthCard title={t.statusTitle}>
      <StatusCard rejected={rejected} />
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

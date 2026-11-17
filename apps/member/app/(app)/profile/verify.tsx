import type { ApplicationStatus } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { RegistrationStatus } from "../../../src/components/registration-status";
import { RegistrationWizard } from "../../../src/components/registration-wizard";
import { ScreenTitle } from "../../../src/components/screens";
import { usePhone } from "../../../src/components/sheet";
import { ErrorState } from "../../../src/components/states";
import { VerifySideCard } from "../../../src/components/verify-overview";
import { useLanguage } from "../../../src/lib/language";
import { accessToken, loadDraft, type SavedDraft } from "../../../src/lib/registration";
import { registrationClient, supabase } from "../../../src/lib/supabase";
import { wizardApi } from "../../../src/lib/wizard-api";

type Loaded = { status: ApplicationStatus; draft: SavedDraft | null };

/** The signed-in member's profile name, for the card beside the steps. */
function useProfileName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id;
      if (!id) return;
      const { data: row } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("member_id", id)
        .maybeSingle();
      if (live) setName((row as { full_name: string | null } | null)?.full_name ?? null);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return name;
}

/** The full name a provider such as Google gave, for a draft that has none yet (R28). */
async function nameFromProvider(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata ?? {};
  const name = (meta.full_name ?? meta.name) as string | undefined;
  return name?.trim() || undefined;
}

async function phoneMissing(): Promise<boolean> {
  const { data } = await supabase.rpc("my_phone_missing");
  return data === true;
}

async function loadVerification(): Promise<Loaded> {
  const status = await registrationClient.status(await accessToken());
  if (status.kind !== "drafting") return { status, draft: null };
  const [saved, needsPhone, providerName] = await Promise.all([
    loadDraft(),
    phoneMissing(),
    nameFromProvider(),
  ]);
  const fullName = saved.data.fullName || providerName;
  return {
    status,
    draft: { ...saved, data: { ...saved.data, needsPhone, ...(fullName ? { fullName } : {}) } },
  };
}

/** S05 and S06 in the profile (R28): the verification steps while they are written, then the review status. */
export default function VerifyIdentityScreen() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const api = useMemo(() => wizardApi(language), [language]);
  const phone = usePhone();
  const profileName = useProfileName();

  useEffect(() => {
    let live = true;
    loadVerification().then(
      (next) => {
        if (!live) return;
        setFailed(next.status.kind === "network");
        setLoaded(next);
        if (next.status.kind === "approved")
          supabase.auth.refreshSession().then(() => router.replace("/"));
        if (next.status.kind === "signed_out") supabase.auth.signOut();
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [round, router]);

  const reload = () => {
    setFailed(false);
    setLoaded(null);
    setRound((r) => r + 1);
  };

  const drafting = !failed && loaded?.status.kind === "drafting" && loaded.draft;
  const main = (
    <View className="min-w-0 flex-1 gap-4">
      {drafting || loaded?.status.kind === "under_review" ? null : (
        <ScreenTitle>{t.verifyTitle}</ScreenTitle>
      )}
      {failed ? <ErrorState message={t.statusLoadFailed} onRetry={reload} /> : null}
      {!failed && loaded?.status.kind === "drafting" && loaded.draft ? (
        <RegistrationWizard initial={loaded.draft} api={api} onSubmitted={reload} />
      ) : null}
      {!failed && (loaded?.status.kind === "under_review" || loaded?.status.kind === "rejected") ? (
        <RegistrationStatus
          status={loaded.status}
          onResubmit={async () => {
            const ok = await registrationClient.startResubmission(await accessToken());
            if (ok) reload();
            return ok;
          }}
        />
      ) : null}
    </View>
  );
  if (phone) return main;
  return (
    <View className="w-full max-w-[1200px] flex-row items-start gap-6 self-center">
      <VerifySideCard
        name={loaded?.draft?.data.fullName || profileName}
        underReview={loaded?.status.kind === "under_review"}
      />
      {main}
    </View>
  );
}

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLanguage } from "../lib/language";
import type { Profile, ProfileApi } from "../lib/profile";
import { EmptyState, ErrorState, LoadingRows } from "./states";

/** Loads a profile (yours when memberId is null) and hands it to its screen, or shows why it can't. */
export function ProfileLoader({
  api,
  memberId,
  children,
}: {
  api: ProfileApi;
  memberId: string | null;
  children: (profile: Profile) => React.ReactNode;
}) {
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.load(memberId, language).then(
      (loaded) => live && setProfile(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, memberId, language, attempt]);

  if (failed)
    return (
      <ErrorState
        message={t.profileLoadFailed}
        onRetry={() => {
          setFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (profile === undefined) return <LoadingRows />;
  if (profile === null)
    return <EmptyState title={t.profileNotFound} message={t.profileNotFoundMessage} />;
  return <View>{children(profile)}</View>;
}

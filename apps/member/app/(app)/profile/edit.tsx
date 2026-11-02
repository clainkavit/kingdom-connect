import { useRouter } from "expo-router";
import { ProfileEditor } from "../../../src/components/profile";
import { ProfileLoader } from "../../../src/components/profile-screen";
import { memberProfileApi } from "../../../src/lib/profile-api";

export default function EditProfileScreen() {
  const router = useRouter();
  return (
    <ProfileLoader api={memberProfileApi} memberId={null}>
      {(profile) => (
        <ProfileEditor
          initial={profile}
          api={memberProfileApi}
          onSaved={() => router.replace("/profile")}
        />
      )}
    </ProfileLoader>
  );
}

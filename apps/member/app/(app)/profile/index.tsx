import { ProfileView } from "../../../src/components/profile";
import { ProfileLoader } from "../../../src/components/profile-screen";
import { memberProfileApi } from "../../../src/lib/profile-api";

export default function MyProfileScreen() {
  return (
    <ProfileLoader api={memberProfileApi} memberId={null}>
      {(profile) => <ProfileView profile={profile} />}
    </ProfileLoader>
  );
}

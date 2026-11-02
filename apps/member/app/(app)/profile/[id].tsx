import { useLocalSearchParams } from "expo-router";
import { ProfileView } from "../../../src/components/profile";
import { ProfileLoader } from "../../../src/components/profile-screen";
import { memberProfileApi } from "../../../src/lib/profile-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SUCH_MEMBER = "00000000-0000-0000-0000-000000000000";

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ProfileLoader
      key={id}
      api={memberProfileApi}
      memberId={UUID.test(id ?? "") ? id! : NO_SUCH_MEMBER}
    >
      {(profile) => <ProfileView profile={profile} />}
    </ProfileLoader>
  );
}

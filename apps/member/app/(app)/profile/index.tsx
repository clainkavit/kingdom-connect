import { ProfileIdeas } from "../../../src/components/ideas-pool";
import { ProfileView } from "../../../src/components/profile";
import { ProfileLoader } from "../../../src/components/profile-screen";
import { ProfileReferences } from "../../../src/components/work";
import { ideasApi } from "../../../src/lib/ideas";
import { memberProfileApi } from "../../../src/lib/profile-api";
import { workApi } from "../../../src/lib/work";

export default function MyProfileScreen() {
  return (
    <ProfileLoader api={memberProfileApi} memberId={null}>
      {(profile) => (
        <ProfileView
          profile={profile}
          ideas={<ProfileIdeas api={ideasApi} memberId={profile.memberId} />}
          references={
            <ProfileReferences
              api={workApi}
              memberId={profile.memberId}
              name={profile.fullName}
              own={profile.own}
            />
          }
        />
      )}
    </ProfileLoader>
  );
}

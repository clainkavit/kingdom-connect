import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ConnectPanel } from "../../../src/components/connections";
import { ProfileView } from "../../../src/components/profile";
import { ProfileLoader } from "../../../src/components/profile-screen";
import { connectionsApi } from "../../../src/lib/connections";
import { memberMessagesApi } from "../../../src/lib/messages-api";
import { memberProfileApi } from "../../../src/lib/profile-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SUCH_MEMBER = "00000000-0000-0000-0000-000000000000";

export default function MemberProfileScreen() {
  const { id, connect } = useLocalSearchParams<{ id: string; connect?: string }>();
  const [reloads, setReloads] = useState(0);
  return (
    <ProfileLoader
      key={`${id}:${reloads}`}
      api={memberProfileApi}
      memberId={UUID.test(id ?? "") ? id! : NO_SUCH_MEMBER}
    >
      {(profile) => (
        <ProfileView
          profile={profile}
          actions={
            <ConnectPanel
              memberId={profile.memberId}
              name={profile.fullName}
              api={connectionsApi}
              messagesApi={memberMessagesApi}
              startWriting={connect === "1"}
              onBlocked={() => setReloads((r) => r + 1)}
            />
          }
        />
      )}
    </ProfileLoader>
  );
}

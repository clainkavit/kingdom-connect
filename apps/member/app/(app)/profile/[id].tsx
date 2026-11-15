import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ConnectPanel } from "../../../src/components/connections";
import { ProfileIdeas } from "../../../src/components/ideas-pool";
import { ProfileView } from "../../../src/components/profile";
import { ProfileLoader } from "../../../src/components/profile-screen";
import { usePhone } from "../../../src/components/sheet";
import { ProfileReferences } from "../../../src/components/work";
import { connectionsApi } from "../../../src/lib/connections";
import { ideasApi } from "../../../src/lib/ideas";
import { memberMessagesApi } from "../../../src/lib/messages-api";
import { memberProfileApi } from "../../../src/lib/profile-api";
import { workApi } from "../../../src/lib/work";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SUCH_MEMBER = "00000000-0000-0000-0000-000000000000";

export default function MemberProfileScreen() {
  const { id, connect } = useLocalSearchParams<{ id: string; connect?: string }>();
  const [reloads, setReloads] = useState(0);
  const phone = usePhone();
  return (
    <ProfileLoader
      key={`${id}:${reloads}`}
      api={memberProfileApi}
      memberId={UUID.test(id ?? "") ? id! : NO_SUCH_MEMBER}
    >
      {(profile) => {
        const ideas = <ProfileIdeas api={ideasApi} memberId={profile.memberId} />;
        const references = (
          <ProfileReferences
            api={workApi}
            memberId={profile.memberId}
            name={profile.fullName}
            own={profile.own}
          />
        );
        const panel = (split?: Parameters<typeof ConnectPanel>[0]["split"]) => (
          <ConnectPanel
            memberId={profile.memberId}
            name={profile.fullName}
            api={connectionsApi}
            messagesApi={memberMessagesApi}
            startWriting={connect === "1"}
            onBlocked={() => setReloads((r) => r + 1)}
            split={split}
          />
        );
        if (phone || profile.own)
          return (
            <ProfileView
              profile={profile}
              ideas={ideas}
              references={references}
              actions={profile.own ? undefined : panel()}
            />
          );
        return panel((hero, side) => (
          <ProfileView
            profile={profile}
            hero={hero}
            side={side}
            ideas={ideas}
            references={references}
          />
        ));
      }}
    </ProfileLoader>
  );
}

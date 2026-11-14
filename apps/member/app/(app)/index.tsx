import { DashboardScreen } from "../../src/components/dashboard";
import { LookHome, useLook } from "../../src/components/look";
import { useLanguage } from "../../src/lib/language";
import { memberProfileApi } from "../../src/lib/profile-api";
import { connectionsApi } from "../../src/lib/connections";
import { dashboardApi } from "../../src/lib/dashboard";
import { dashboardWidgetsApi } from "../../src/lib/dashboard-widgets";
import { memberNewsApi } from "../../src/lib/news";
import { peopleYouMayKnowApi } from "../../src/lib/people-you-may-know";
import { accessToken } from "../../src/lib/registration";
import { registrationClient } from "../../src/lib/supabase";

const applicationStatus = async () => registrationClient.status(await accessToken());

export default function DashboardPage() {
  const { language } = useLanguage();
  const { looking } = useLook();
  if (looking) return <LookHome widgets={dashboardWidgetsApi} status={applicationStatus} />;
  return (
    <DashboardScreen
      api={dashboardApi}
      connections={connectionsApi}
      widgets={dashboardWidgetsApi}
      news={memberNewsApi}
      people={peopleYouMayKnowApi}
      profile={() => memberProfileApi.load(null, language)}
    />
  );
}

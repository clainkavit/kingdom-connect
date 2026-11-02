import { ComingSoon } from "../../src/components/screens";
import { useLanguage } from "../../src/lib/language";

export default function DashboardScreen() {
  const { t } = useLanguage();
  return <ComingSoon title={t.navDashboard} />;
}

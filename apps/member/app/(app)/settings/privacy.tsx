import { PrivacyScreen } from "../../../src/components/privacy";
import { privacyApi } from "../../../src/lib/privacy";

export default function PrivacySettingsScreen() {
  return <PrivacyScreen api={privacyApi} />;
}

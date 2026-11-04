import { PrivacyScreen } from "../../../src/components/privacy";
import { connectionsApi } from "../../../src/lib/connections";
import { contactApi } from "../../../src/lib/contact";
import { privacyApi } from "../../../src/lib/privacy";

export default function PrivacySettingsScreen() {
  return <PrivacyScreen api={privacyApi} connections={connectionsApi} contact={contactApi} />;
}

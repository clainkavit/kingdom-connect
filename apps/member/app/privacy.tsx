import { LegalPage } from "../src/components/legal-page";
import { readPublicLegal } from "../src/lib/legal";

export default function PrivacyScreen() {
  return <LegalPage kind="privacy" read={readPublicLegal} />;
}

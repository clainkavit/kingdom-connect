import { LegalPage } from "../src/components/legal-page";
import { readPublicLegal } from "../src/lib/legal";

export default function TermsScreen() {
  return <LegalPage kind="terms" read={readPublicLegal} />;
}

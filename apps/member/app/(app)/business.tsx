import { BusinessScreen } from "../../src/components/business";
import { memberBusinessApi } from "../../src/lib/business-api";

export default function BusinessPage() {
  return <BusinessScreen api={memberBusinessApi} />;
}

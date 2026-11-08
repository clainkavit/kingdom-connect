import { SavedIdeas } from "../../../src/components/investor";
import { investorApi } from "../../../src/lib/investor";

export default function SavedIdeasScreen() {
  return <SavedIdeas investor={investorApi} />;
}

import { useLocalSearchParams } from "expo-router";
import { OpportunityDetailScreen } from "../../../../src/components/opportunities";
import { RespondPanel } from "../../../../src/components/responses";
import type { MySkillsApi } from "../../../../src/components/your-skills";
import { useLanguage } from "../../../../src/lib/language";
import { opportunityBrowseApi } from "../../../../src/lib/opportunity-browse";
import { memberProfileApi } from "../../../../src/lib/profile-api";
import { memberResponsesApi } from "../../../../src/lib/responses-api";

export default function OpportunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language } = useLanguage();
  const mySkills: MySkillsApi = {
    load: async () => (await memberProfileApi.load(null, language))?.skills ?? [],
    set: (skills) => memberProfileApi.setSkills(skills),
  };
  return (
    <OpportunityDetailScreen
      key={id}
      api={opportunityBrowseApi}
      id={id ?? ""}
      respond={(post) => <RespondPanel api={memberResponsesApi} post={post} />}
      mySkills={mySkills}
    />
  );
}

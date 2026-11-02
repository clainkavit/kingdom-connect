import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { acceptCurrentTexts, LOCAL_SERVICE_ROLE_KEY } from "./helpers";

export default async function globalSetup() {
  const members: { id: string }[] = await fetch(
    `${LOCAL_SUPABASE.url}/rest/v1/members?status=eq.approved&select=id`,
    {
      headers: {
        apikey: LOCAL_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      },
    },
  ).then((r) => r.json());
  await acceptCurrentTexts(members.map((m) => m.id));
}

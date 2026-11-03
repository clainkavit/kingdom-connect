import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { createClient } from "@supabase/supabase-js";
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
  await warmUpRealtime();
}

/** A fresh Realtime server sets up replication on its first subscription, which can outlast a test's wait. */
async function warmUpRealtime() {
  const client = createClient(LOCAL_SUPABASE.url, LOCAL_SERVICE_ROLE_KEY);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime did not start within 90 seconds")),
      90_000,
    );
    client
      .channel("warm-up")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => undefined)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
      });
  });
  await client.removeAllChannels();
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LOCAL_SUPABASE } from "../src/auth";
import { legalKinds, parseLegalFile } from "../src/legal";
import { LOCAL_SERVICE_ROLE_KEY } from "../src/local-dev";

const url = process.env.SUPABASE_URL ?? LOCAL_SUPABASE.url;
const key = process.env.SUPABASE_URL
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : LOCAL_SERVICE_ROLE_KEY;
if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY to load texts into a hosted project");

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
const read = (kind: string, language: string) =>
  parseLegalFile(
    readFileSync(
      fileURLToPath(new URL(`../../../legal/${kind}.${language}.md`, import.meta.url)),
      "utf8",
    ),
  );

for (const kind of legalKinds) {
  const en = read(kind, "en");
  const sw = read(kind, "sw");
  if (en.version !== sw.version || en.effective !== sw.effective || en.approved !== sw.approved)
    throw new Error(`${kind}: the English and Kiswahili headers differ`);

  const query = `kind=eq.${kind}&version=eq.${en.version}&select=body_en,body_sw`;
  const existing = await fetch(`${url}/rest/v1/legal_texts?${query}`, { headers }).then((r) =>
    r.json(),
  );
  if (existing.length) {
    if (existing[0].body_en !== en.body || existing[0].body_sw !== sw.body)
      throw new Error(
        `${kind} ${en.version} is already loaded with other wording: raise the version`,
      );
    console.log(`${kind} ${en.version}: already loaded`);
    continue;
  }

  const res = await fetch(`${url}/rest/v1/legal_texts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind,
      version: en.version,
      body_en: en.body,
      body_sw: sw.body,
      effective_at: en.effective,
      approved_at: en.approved,
    }),
  });
  if (!res.ok) throw new Error(`${kind} ${en.version}: ${res.status} ${await res.text()}`);
  console.log(`${kind} ${en.version}: loaded`);
}

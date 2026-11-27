import { sql } from "../_shared/db.ts";
import { json, roleOf } from "../_shared/http.ts";
import {
  AJIRA_QUERY,
  AJIRA_URL,
  AZURE_TRANSLATE_URL,
  CRDB_URL,
  type Listing,
  NEST_ENTITY_URL,
  NEST_URL,
  nestEntityQuery,
  nestQuery,
  pickTranslations,
  readAjira,
  readCrdb,
  readNest,
  readNestEntity,
} from "../_shared/public-listings.ts";

const MAX_NEST_PAGES = 10;
const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "KingdomConnect-PublicListings/1.0",
};

async function getJson(url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

async function readNestAll(): Promise<Listing[]> {
  const listings: Listing[] = [];
  const entities = new Set<string>();
  for (let page = 1; page <= MAX_NEST_PAGES; page++) {
    const read = readNest(await getJson(NEST_URL, nestQuery(page)));
    listings.push(...read.listings);
    read.entities.forEach((e) => entities.add(e));
    if (!read.hasNext) break;
  }
  const places = new Map<string, { region?: string; district?: string }>();
  for (const entity of entities) {
    try {
      places.set(entity, readNestEntity(await getJson(NEST_ENTITY_URL, nestEntityQuery(entity))));
    } catch {
      places.set(entity, {});
    }
  }
  return listings.map((l) => ({ ...l, ...places.get(String(l.details.procuring_entity)) }));
}

const readers: Record<string, () => Promise<Listing[]>> = {
  nest: readNestAll,
  ajira: async () => readAjira(await getJson(AJIRA_URL, AJIRA_QUERY)),
  crdb: async () => readCrdb(await getJson(CRDB_URL)),
};

async function translate(listings: Listing[]): Promise<void> {
  const key = Deno.env.get("AZURE_TRANSLATOR_KEY");
  if (!key || listings.length === 0) return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
  };
  const region = Deno.env.get("AZURE_TRANSLATOR_REGION");
  if (region) headers["Ocp-Apim-Subscription-Region"] = region;
  for (let i = 0; i < listings.length; i += 25) {
    const batch = listings.slice(i, i + 25);
    const texts = batch.flatMap((l) => [l.title, l.summary ?? ""]);
    const languages = batch.flatMap((l) => [l.language, l.language]);
    try {
      const res = await fetch(AZURE_TRANSLATE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(texts.map((Text) => ({ Text: Text || " " }))),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return;
      const picked = pickTranslations(await res.json(), languages);
      batch.forEach((l, n) => {
        l.translated_title = picked[n * 2];
        if (l.summary) l.translated_summary = picked[n * 2 + 1];
      });
    } catch {
      return;
    }
  }
}

async function needsTranslation(key: string, listing: Listing): Promise<boolean> {
  const [row] =
    await sql`select private.public_listing_translated(${key}, ${listing.external_id}) as done`;
  return !row?.done;
}

Deno.serve(async (req) => {
  if (roleOf(req) !== "service_role") return json({ error: "forbidden" }, 403);

  const sources =
    await sql`select key from public.public_listing_sources where active order by key`;
  const report: Record<string, { found: number; closed: number; error?: string }> = {};

  for (const { key } of sources as unknown as { key: string }[]) {
    const read = readers[key];
    if (!read) {
      await sql`select private.finish_public_listing_run(${key}, ${[]}::text[], ${"No reader for this source yet"})`;
      report[key] = { found: 0, closed: 0, error: "no reader" };
      continue;
    }
    try {
      const listings = await read();
      const fresh: Listing[] = [];
      for (const l of listings) if (await needsTranslation(key, l)) fresh.push(l);
      await translate(fresh);
      for (const l of listings) {
        await sql`select private.save_public_listing(${key}, ${sql.json(l as never)})`;
      }
      const [done] = await sql`
        select private.finish_public_listing_run(${key}, ${listings.map((l) => l.external_id)}::text[]) as closed`;
      report[key] = { found: listings.length, closed: Number(done?.closed ?? 0) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`select private.finish_public_listing_run(${key}, ${[]}::text[], ${message})`;
      report[key] = { found: 0, closed: 0, error: message };
    }
  }
  return json(report);
});

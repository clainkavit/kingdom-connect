import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { sql } from "../_shared/db.ts";
import { json, roleOf } from "../_shared/http.ts";
import {
  AJIRA_ADVERTS_URL,
  AJIRA_QUERY,
  AJIRA_URL,
  ajiraAdvertPdf,
  CRDB_URL,
  GEMINI_MODEL,
  geminiAdvertRequest,
  geminiTranslateRequest,
  geminiUrl,
  type Listing,
  NEST_ENTITY_URL,
  NEST_URL,
  nestEntityQuery,
  nestQuery,
  readAdvertPosts,
  readAjira,
  readAjiraAdverts,
  readCrdb,
  readNest,
  readNestEntity,
  readTranslations,
} from "../_shared/public-listings.ts";

const MAX_NEST_PAGES = 10;
const MAX_ADVERTS_PER_RUN = 4;
const MAX_TRANSLATIONS_PER_RUN = 60;
const LOOKUP_SECONDS = 40;
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

const geminiKey = () => Deno.env.get("GEMINI_API_KEY");

/** One Gemini call. A busy or rate-limited answer is tried once more after a short wait. */
async function gemini(body: unknown): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(geminiUrl(Deno.env.get("GEMINI_MODEL") ?? GEMINI_MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey()! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) return res.json();
    if (attempt < 2 && [429, 500, 503].includes(res.status)) {
      await new Promise((done) => setTimeout(done, 5_000));
      continue;
    }
    throw new Error(`Gemini answered ${res.status}`);
  }
}

type Read = { listings: Listing[]; seen: string[]; markGone: boolean };

async function readNestAll(): Promise<Read> {
  const listings: Listing[] = [];
  const entities = new Set<string>();
  for (let page = 1; page <= MAX_NEST_PAGES; page++) {
    const read = readNest(await getJson(NEST_URL, nestQuery(page)));
    listings.push(...read.listings);
    read.entities.forEach((e) => entities.add(e));
    if (!read.hasNext) break;
  }
  const [known] = await sql`select private.public_listing_ids('nest', '') as ids`;
  const old = new Set((known?.ids ?? []) as string[]);
  const fresh = new Set(
    listings.filter((l) => !old.has(l.external_id)).map((l) => String(l.details.procuring_entity)),
  );
  const places = new Map<string, { region?: string; district?: string }>();
  const lookups = [...entities].filter((e) => fresh.has(e));
  const stopAt = Date.now() + LOOKUP_SECONDS * 1000;
  for (let i = 0; i < lookups.length && Date.now() < stopAt; i += 10) {
    await Promise.all(
      lookups.slice(i, i + 10).map(async (entity) => {
        try {
          places.set(
            entity,
            readNestEntity(await getJson(NEST_ENTITY_URL, nestEntityQuery(entity))),
          );
        } catch {
          places.set(entity, {});
        }
      }),
    );
  }
  const all = listings.map((l) => ({ ...l, ...places.get(String(l.details.procuring_entity)) }));
  return { listings: all, seen: all.map((l) => l.external_id), markGone: true };
}

/** New advert PDFs are read by Gemini, a few per run; adverts read before are only counted as seen. */
async function readAjiraAdvertsAll(): Promise<Read> {
  if (!geminiKey()) throw new Error("GEMINI_API_KEY is not set, so advert PDFs cannot be read");
  const adverts = readAjiraAdverts(await getJson(AJIRA_ADVERTS_URL));
  const listings: Listing[] = [];
  const seen: string[] = [];
  let read = 0;
  for (const advert of adverts) {
    const [known] =
      await sql`select private.public_listing_ids('ajira_adverts', ${advert.id + "#"}) as ids`;
    const ids = (known?.ids ?? []) as string[];
    if (ids.length > 0) {
      seen.push(...ids);
      continue;
    }
    if (read >= MAX_ADVERTS_PER_RUN) continue;
    read++;
    const pdf = await fetch(ajiraAdvertPdf(advert.token), { signal: AbortSignal.timeout(60_000) });
    if (!pdf.ok) continue;
    const posts = readAdvertPosts(
      await gemini(
        geminiAdvertRequest(encodeBase64(new Uint8Array(await pdf.arrayBuffer())), advert.title),
      ),
      advert,
    );
    listings.push(...posts);
    seen.push(...posts.map((p) => p.external_id));
  }
  return { listings, seen, markGone: false };
}

const fromList = (listings: Listing[]): Read => ({
  listings,
  seen: listings.map((l) => l.external_id),
  markGone: true,
});

const readers: Record<string, () => Promise<Read>> = {
  nest: readNestAll,
  ajira: async () => fromList(readAjira(await getJson(AJIRA_URL, AJIRA_QUERY))),
  crdb: async () => fromList(readCrdb(await getJson(CRDB_URL))),
  ajira_adverts: readAjiraAdvertsAll,
};

/** Translate the title and summary of listings that have none yet, 20 at a time. A failed batch waits for staff. */
async function translate(listings: Listing[]): Promise<void> {
  if (!geminiKey()) return;
  const todo = listings.filter((l) => !l.translated_title).slice(0, MAX_TRANSLATIONS_PER_RUN);
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const items = batch.flatMap((l) => [
      { text: l.title, language: l.language },
      { text: l.summary ?? "", language: l.language },
    ]);
    try {
      const out = readTranslations(await gemini(geminiTranslateRequest(items)), items.length);
      batch.forEach((l, n) => {
        l.translated_title = out[n * 2];
        if (l.summary) l.translated_summary = out[n * 2 + 1];
      });
    } catch {
      return;
    }
  }
}

/** The listings of a source that already have a translation, in one query. */
async function translatedIds(key: string): Promise<Set<string>> {
  const rows = await sql`
    select l.external_id from public.public_listings l
    join public.public_listing_sources s on s.id = l.source_id
    where s.key = ${key} and l.translated_title is not null`;
  return new Set(rows.map((r) => r.external_id as string));
}

Deno.serve(async (req) => {
  if (roleOf(req) !== "service_role") return json({ error: "forbidden" }, 403);

  const wanted = ((await req.json().catch(() => ({}))) as { source?: string }).source ?? null;
  const sources = await sql`
    select key from public.public_listing_sources
    where active and (${wanted}::text is null or key = ${wanted}) order by key`;
  const report: Record<string, { found: number; closed: number; error?: string }> = {};

  for (const { key } of sources as unknown as { key: string }[]) {
    const read = readers[key];
    if (!read) {
      await sql`select private.finish_public_listing_run(${key}, ${[]}::text[], ${"No reader for this source yet"})`;
      report[key] = { found: 0, closed: 0, error: "no reader" };
      continue;
    }
    try {
      const { listings, seen, markGone } = await read();
      const done = await translatedIds(key);
      await translate(listings.filter((l) => !done.has(l.external_id)));
      for (let i = 0; i < listings.length; i += 100) {
        await sql`
          select count(private.save_public_listing(${key}, item))
          from jsonb_array_elements(${sql.json(listings.slice(i, i + 100) as never)}) item`;
      }
      const [run] = await sql`
        select private.finish_public_listing_run(${key}, ${seen}::text[], null, ${markGone}) as closed`;
      report[key] = { found: listings.length, closed: Number(run?.closed ?? 0) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`select private.finish_public_listing_run(${key}, ${[]}::text[], ${message})`;
      report[key] = { found: 0, closed: 0, error: message };
    }
  }
  return json(report);
});

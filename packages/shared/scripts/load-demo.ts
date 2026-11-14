/**
 * Loads the demo content (supabase/demo/demo-seed.sql) and its placeholder files into a test
 * environment, so every journey has something to act on (PRD section 17, Test data).
 *
 *   DB_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD=... pnpm demo:load
 *
 * With no variables it loads into the local stack. It refuses to run unless the platform setting
 * test_data_only is on. Safe to run again. The images are generated shapes, never real faces.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import postgres from "postgres";
import { LOCAL_SUPABASE } from "../src/auth";
import { LOCAL_SERVICE_ROLE_KEY } from "../src/local-dev";

const dbUrl = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const url = process.env.SUPABASE_URL ?? LOCAL_SUPABASE.url;
const key = process.env.SUPABASE_URL
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : LOCAL_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY to load the demo into a hosted project");
if (!password || password.length < 10) throw new Error("Set DEMO_PASSWORD (10 characters or more)");

// Placeholder files ---------------------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

type Rgb = [number, number, number];
const PALETTE: Rgb[] = [
  [122, 30, 46],
  [201, 162, 74],
  [36, 64, 98],
  [64, 120, 96],
  [176, 96, 60],
  [92, 72, 140],
];

/** An abstract picture: a two-colour gradient with circles, seeded so each file looks different. */
export function placeholderPng(seed: string, width = 320, height = 320, card = false): Buffer {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = (n: number) => PALETTE[(h >>> n) % PALETTE.length]!;
  const [a, b, dot] = [pick(0), pick(5), pick(11)];
  const circles = [0, 1, 2].map((i) => ({
    x: ((h >>> (i * 7)) % width) | 0,
    y: ((h >>> (i * 5 + 3)) % height) | 0,
    r: 30 + ((h >>> (i * 3)) % 70),
  }));
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const t = (x + y) / (width + height);
      let px: Rgb = [0, 1, 2].map((i) => Math.round(a[i]! * (1 - t) + b[i]! * t)) as Rgb;
      if (circles.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r ** 2))
        px = px.map((v, i) => Math.round((v + dot[i]!) / 2)) as Rgb;
      // An ID-card look: a pale photo box and text bars, with no real details.
      if (card) {
        if (x > 20 && x < 110 && y > 40 && y < 150) px = [230, 226, 216];
        else if (x > 130 && x < width - 20 && [50, 80, 110, 140].some((r) => y > r && y < r + 10))
          px = [240, 240, 240];
      }
      row.set(px, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A one-page PDF with a title and a few lines of text. */
export function placeholderPdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = [
    "BT /F1 20 Tf 60 760 Td",
    `(${esc(title)}) Tj`,
    "/F1 12 Tf 0 -36 Td",
    ...lines.map((l) => `(${esc(l)}) Tj 0 -18 Td`),
    "0 -18 Td (Demo document for a test environment. Not a real record.) Tj",
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

// Load ------------------------------------------------------------------------------------------

const D = (n: string) => `de300000-0000-4000-8000-0000000000${n}`;
const S = (n: string) => `5eed0000-0000-4000-8000-0000000000${n}`;
const THREAD = "de300000-0000-4000-8000-00000000a501";
const MESSAGE = "de300000-0000-4000-8000-00000000a603";
const PLAN = "de300000-0000-4000-8000-00000000f001";
const pdf = placeholderPdf;

const files: { bucket: string; path: string; type: string; body: Buffer }[] = [
  ...["01", "02", "03", "04", "05", "06", "07", "10"].map((n) => ({
    bucket: "avatars",
    path: `${D(n)}/photo`,
    type: "image/png",
    body: placeholderPng(`avatar-${n}`, 256, 256),
  })),
  ...[D("12"), S("01")].flatMap((m) => [
    {
      bucket: "identity-documents",
      path: `${m}/face`,
      type: "image/png",
      body: placeholderPng(`face-${m}`, 320, 400),
    },
    {
      bucket: "identity-documents",
      path: `${m}/id`,
      type: "image/png",
      body: placeholderPng(`id-${m}`, 480, 300, true),
    },
  ]),
  {
    bucket: "business-documents",
    path: `${D("11")}/demo-brela.pdf`,
    type: "application/pdf",
    body: pdf("BRELA certificate (demo)", [
      "Said Auto Garage (demo)",
      "Registration no. DEMO-BRELA-011",
    ]),
  },
  {
    bucket: "business-documents",
    path: `${D("11")}/demo-tin.pdf`,
    type: "application/pdf",
    body: pdf("TIN certificate (demo)", ["Said Auto Garage (demo)", "TIN 100-200-011"]),
  },
  {
    bucket: "business-documents",
    path: `${D("11")}/demo-licence.png`,
    type: "image/png",
    body: placeholderPng("licence-11", 480, 640, true),
  },
  {
    bucket: "tender-documents",
    path: `${D("05")}/demo-tender.pdf`,
    type: "application/pdf",
    body: pdf("Tender MB-DEMO-2026-01", [
      "Supply of 2,000 bags of 42.5N cement",
      "Four deliveries over eight weeks, Temeke",
      "Closing at 16:00 on the closing date",
      "No fee is charged to bid.",
    ]),
  },
  {
    bucket: "response-files",
    path: `${D("09")}/demo-cv.pdf`,
    type: "application/pdf",
    body: pdf("CV: Peter Ndege (demo)", [
      "Driver, Morogoro",
      "Class C licence",
      "Five years of deliveries to building sites",
    ]),
  },
  {
    bucket: "response-files",
    path: `${D("03")}/demo-cv.pdf`,
    type: "application/pdf",
    body: pdf("CV: Neema Kimaro (demo)", [
      "Accountant, Ilala",
      "Bookkeeping and TRA returns for small shops",
    ]),
  },
  ...[D("06"), S("05")].map((m) => ({
    bucket: "plan-documents",
    path: `${PLAN}/${m}.pdf`,
    type: "application/pdf",
    body: pdf("Signed milestone plan (demo)", [
      "Solar cold storage for market traders",
      "Three milestones agreed by both members",
      `Signed by member ${m.slice(-2)}`,
    ]),
  })),
  {
    bucket: "message-files",
    path: `${THREAD}/${MESSAGE}/price-list.pdf`,
    type: "application/pdf",
    body: pdf("Price list (demo)", [
      "Soap, carton of 48: TZS 52,000",
      "Cooking oil, 20 L: TZS 78,000",
    ]),
  },
  {
    bucket: "message-files",
    path: `${THREAD}/${MESSAGE}/cartons.png`,
    type: "image/png",
    body: placeholderPng("cartons", 480, 320),
  },
  {
    bucket: "public-media",
    path: "news/de300000-0000-4000-8000-00000000a302.png",
    type: "image/png",
    body: placeholderPng("news-breakfast", 800, 450),
  },
];

const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
try {
  const [setting] =
    await sql`select value from public.platform_settings where key = 'test_data_only'`;
  if (String(setting?.value) !== "true")
    throw new Error("test_data_only is not on here: the demo is for test environments only");

  const seed = readFileSync(
    fileURLToPath(new URL("../../../supabase/demo/demo-seed.sql", import.meta.url)),
    "utf8",
  ).replaceAll("__DEMO_PASSWORD__", password.replaceAll("'", "''"));
  await sql.begin((tx) => tx.unsafe(seed));
  console.log("demo rows: loaded");

  for (const f of files) {
    const res = await fetch(`${url}/storage/v1/object/${f.bucket}/${f.path}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": f.type,
        "x-upsert": "true",
      },
      body: new Uint8Array(f.body),
    });
    if (!res.ok) throw new Error(`${f.bucket}/${f.path}: ${res.status} ${await res.text()}`);
  }
  // Record the real sizes of the files the rows point at.
  for (const f of files) {
    if (f.bucket === "message-files")
      await sql`update public.message_attachments set size = ${f.body.length} where storage_path = ${f.path}`;
    if (f.bucket === "plan-documents")
      await sql`update public.plan_documents set size = ${f.body.length} where storage_path = ${f.path}`;
  }
  console.log(`demo files: ${files.length} uploaded`);
} finally {
  await sql.end();
}

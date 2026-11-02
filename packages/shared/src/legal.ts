/** The five legal texts, PRD section 13 (Legal texts) and docs/schema.md section 9. */

export const legalKinds = ["terms", "privacy", "nda", "ip", "handoff"] as const;
export type LegalKind = (typeof legalKinds)[number];

/** Accepted at registration and again at the next login when they change (S07). */
export const reacceptKinds: readonly LegalKind[] = ["terms", "privacy"];

export type LegalFile = {
  version: string;
  effective: string;
  approved: string | null;
  body: string;
};

const VERSION = /^[0-9]+\.[0-9]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads a legal/<kind>.<language>.md file: a version header between --- lines, then the text. */
export function parseLegalFile(source: string): LegalFile {
  const match = source.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("A legal text starts with a --- header");
  const header = Object.fromEntries(
    match[1]!.split("\n").map((line) => {
      const at = line.indexOf(":");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  const version = header.version ?? "";
  const effective = header.effective ?? "";
  const approved = header.approved || null;
  if (!VERSION.test(version)) throw new Error(`Version "${version}" is not major.minor`);
  if (!DATE.test(effective)) throw new Error(`Effective date "${effective}" is not YYYY-MM-DD`);
  if (approved && !DATE.test(approved))
    throw new Error(`Approved date "${approved}" is not YYYY-MM-DD`);
  return { version, effective, approved, body: match[2]!.trim() };
}

/** Sorts major.minor versions newest first. */
export function compareVersions(a: string, b: string): number {
  const [am = 0, an = 0] = a.split(".").map(Number);
  const [bm = 0, bn = 0] = b.split(".").map(Number);
  return bm - am || bn - an;
}

export const isDraftVersion = (version: string, approvedAt: string | null): boolean =>
  Number(version.split(".")[0]) < 1 || !approvedAt;

export type LegalValues = { entity_name: string; platform_name: string };

export function fillLegalText(body: string, values: LegalValues): string {
  return body.replace(
    /\{(entity_name|platform_name)\}/g,
    (_, key: keyof LegalValues) => values[key],
  );
}

export type LegalBlock = { kind: "heading" | "paragraph" | "bullet"; text: string };

/** Splits a text into headings (#), bullets (-) and paragraphs, for screens that show it. */
export function legalBlocks(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    };
    for (const line of chunk.split("\n").map((l) => l.trim())) {
      if (!line) continue;
      if (/^#{1,3} /.test(line)) {
        flush();
        blocks.push({ kind: "heading", text: line.replace(/^#+ /, "") });
      } else if (line.startsWith("- ")) {
        flush();
        blocks.push({ kind: "bullet", text: line.slice(2) });
      } else paragraph.push(line);
    }
    flush();
  }
  return blocks;
}

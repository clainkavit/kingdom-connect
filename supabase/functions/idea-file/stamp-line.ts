/** The standard PDF fonts only draw Latin-1; anything else becomes "?" rather than failing the whole file. */
export const latin1 = (text: string): string =>
  Array.from(text.normalize("NFC"))
    .map((c) => (c.charCodeAt(0) <= 0xff ? c : "?"))
    .join("");

/** The line stamped on every page: who opened it, when, and that it is confidential. */
export function stampLine(viewerName: string, openedAt: Date, platform: string): string {
  const date = openedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Dar_es_Salaam",
  });
  return latin1(`${viewerName} · ${date} · ${platform} · Confidential`);
}

export { cn } from "cn";

/** Whether a PostgREST embed returned a row, whether it came back as an object or a list. */
export function hasRow(embed: object | object[] | null | undefined): boolean {
  return Array.isArray(embed) ? embed.length > 0 : embed != null;
}

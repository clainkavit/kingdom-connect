import { supabase } from "./supabase";

/** Short-lived links for profile photos, keyed by storage path. */
export async function photoLinks(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!wanted.length) return new Map();
  const { data } = await supabase.storage.from("avatars").createSignedUrls(wanted, 300);
  return new Map(
    (data ?? []).flatMap((l) => (l.path && l.signedUrl ? [[l.path, l.signedUrl] as const] : [])),
  );
}

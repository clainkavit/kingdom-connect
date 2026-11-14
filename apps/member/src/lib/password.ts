import { supabase } from "./supabase";

/** The signed-in member's username, read from their own members row (RLS: own row only). */
export async function myUsername(): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession();
  const id = session.session?.user.id;
  if (!id) return null;
  const { data } = await supabase.from("members").select("username").eq("id", id).maybeSingle();
  return typeof data?.username === "string" ? data.username : null;
}

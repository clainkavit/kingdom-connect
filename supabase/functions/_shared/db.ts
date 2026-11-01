import postgres from "npm:postgres@3.4.9";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

export const sql = postgres(Deno.env.get("DB_URL") ?? Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 3,
});

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

export function anonClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function platformName(): Promise<string> {
  const [row] =
    await sql`select value #>> '{}' as name from public.platform_settings where key = 'platform_name'`;
  return row?.name ?? "Kingdom Connect";
}

import { createLoginClient, LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { createClient } from "@supabase/supabase-js";

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE.url;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_SUPABASE.anonKey;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const loginClient = createLoginClient({ url, anonKey });

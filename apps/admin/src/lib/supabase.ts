import { createLoginClient, LOCAL_SUPABASE, parseTestLogins } from "@kingdom-connect/shared";
import { createClient } from "@supabase/supabase-js";

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE.url;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_SUPABASE.anonKey;

export const demoLinks = process.env.NEXT_PUBLIC_DEMO_LINKS === "1";

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: demoLinks,
  },
});

export const loginClient = createLoginClient({ url, anonKey });

/** Fake accounts shown on a preview site's login screen. Never set on a real environment. */
export const testLogins = parseTestLogins(process.env.NEXT_PUBLIC_TEST_LOGINS);

/** The member app of this environment, for "Not staff? Go to the member app". Unset means no link. */
export const memberUrl = process.env.NEXT_PUBLIC_MEMBER_URL || undefined;

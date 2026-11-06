import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createLoginClient,
  createProfileClient,
  createRegistrationClient,
  LOCAL_SUPABASE,
} from "@kingdom-connect/shared";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE.url;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_SUPABASE.anonKey;

export const demoLinks = process.env.EXPO_PUBLIC_DEMO_LINKS === "1";

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: demoLinks,
  },
});

export const loginClient = createLoginClient({ url, anonKey });

export const registrationClient = createRegistrationClient({ url, anonKey });

export const profileClient = createProfileClient({ url, anonKey });

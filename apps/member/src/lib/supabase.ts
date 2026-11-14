import { Platform } from "react-native";
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

/** Where Edge Functions answer, for the few calls that return a file rather than JSON. */
export const functionsUrl = `${url}/functions/v1`;
export const functionsKey = anonKey;

export const demoLinks = process.env.EXPO_PUBLIC_DEMO_LINKS === "1";

/** Continue with Google (R26, #273): on the web, when switched on for this environment. */
export const googleSignIn = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === "1" && Platform.OS === "web";

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: demoLinks || googleSignIn,
  },
});

export const loginClient = createLoginClient({ url, anonKey });

export const registrationClient = createRegistrationClient({ url, anonKey });

export const profileClient = createProfileClient({ url, anonKey });

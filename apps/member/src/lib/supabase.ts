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

/** Continue with Facebook (R30), once Meta's app review passes and the provider is on. */
export const facebookSignIn =
  process.env.EXPO_PUBLIC_FACEBOOK_SIGN_IN === "1" && Platform.OS === "web";

/** Continue with Apple (M05), once the Apple provider is on. */
export const appleSignIn = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === "1" && Platform.OS === "web";

/** Continue with phone number (R29), once an SMS sender is set up for this environment. */
export const phoneSignIn = process.env.EXPO_PUBLIC_PHONE_SIGN_IN === "1";

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: demoLinks || googleSignIn || facebookSignIn || appleSignIn,
  },
});

export const loginClient = createLoginClient({ url, anonKey });

export const registrationClient = createRegistrationClient({ url, anonKey });

export const profileClient = createProfileClient({ url, anonKey });

/** The signed-in account's id from the saved session, with no call to the server. */
export async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

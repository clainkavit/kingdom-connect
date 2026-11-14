import type { FirstResult, FirstSignInApi } from "../components/first-sign-in";
import { textsToAccept } from "./legal";
import { supabase } from "./supabase";

/** S01a (R26) against the database: the free username, the account's email and making the account. */
export const firstSignInApi: FirstSignInApi = {
  suggest: async () => {
    const { data, error } = await supabase.rpc("suggest_username");
    if (error) throw error;
    return (data as string) ?? "";
  },
  email: async () => {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? "";
  },
  texts: textsToAccept,
  complete: async (username, accepted) => {
    const { data, error } = await supabase.rpc("complete_first_sign_in", { username, accepted });
    if (error) throw error;
    return data as FirstResult;
  },
  done: async () => {
    await supabase.auth.refreshSession();
  },
};

/** Starts Continue with Google; Google sends the person back to this site. */
export async function startGoogleSignIn(): Promise<boolean> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/` },
  });
  return !error;
}

/** Google sends people back with an error in the address when they cancel or sign-in fails. */
export const returnedFromGoogleWithError = (): boolean =>
  typeof window !== "undefined" && /[?#&]error(_description)?=/.test(window.location.href);

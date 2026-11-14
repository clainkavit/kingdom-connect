import { routeFor, routePaths, type Route, type Session } from "@kingdom-connect/shared";
import { Redirect } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

type Auth = {
  ready: boolean;
  accessToken: string | null;
  resendAfterSeconds: number;
  startSession: (session: Session, resendAfterSeconds: number) => Promise<void>;
  finishSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(60);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setAccessToken(session?.access_token ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const value: Auth = {
    ready,
    accessToken,
    resendAfterSeconds,
    startSession: async (session, seconds) => {
      setResendAfterSeconds(seconds);
      await supabase.auth.setSession(session);
    },
    finishSignIn: async () => {
      await supabase.auth.refreshSession();
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth needs AuthProvider");
  return auth;
}

export function Guard({
  route,
  children,
}: {
  route: Route | readonly Route[];
  children: React.ReactNode;
}) {
  const { ready, accessToken } = useAuth();
  if (!ready) return null;
  const actual = routeFor(accessToken, "member");
  const allowed: readonly Route[] = typeof route === "string" ? [route] : route;
  if (!allowed.includes(actual)) return <Redirect href={routePaths[actual]} />;
  return <>{children}</>;
}

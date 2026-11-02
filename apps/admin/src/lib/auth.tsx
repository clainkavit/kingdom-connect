"use client";

import { routeFor, routePaths, type Session } from "@kingdom-connect/shared";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { AdminShell } from "@/components/shell";
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

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth needs AuthProvider");
  return auth;
}

const pageRoutes: Record<string, "login" | "verify" | "wrong_app"> = {
  [routePaths.login]: "login",
  [routePaths.verify]: "verify",
  [routePaths.wrong_app]: "wrong_app",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(60);
  const pathname = usePathname();
  const router = useRouter();

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

  const route = routeFor(accessToken, "admin");
  const pageRoute = pageRoutes[pathname];
  const allowed = pageRoute ? pageRoute === route : route === "app";

  useEffect(() => {
    if (ready && !allowed) router.replace(routePaths[route]);
  }, [ready, allowed, route, router]);

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

  if (!ready || !allowed) return <AuthContext.Provider value={value}>{null}</AuthContext.Provider>;
  return (
    <AuthContext.Provider value={value}>
      {pageRoute ? children : <AdminShell onSignOut={value.signOut}>{children}</AdminShell>}
    </AuthContext.Provider>
  );
}

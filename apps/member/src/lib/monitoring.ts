import { scrubEvent } from "@kingdom-connect/shared";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Crash reports to Sentry, loaded after the first screen so it never slows the first visit. Off without a DSN. */
export function startMonitoring() {
  if (!dsn) return;
  void import("@sentry/react-native").then((Sentry) =>
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => (crumb.category === "console" ? null : crumb),
    }),
  );
}

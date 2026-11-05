import { scrubEvent } from "@kingdom-connect/shared";
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn)
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => (crumb.category === "console" ? null : crumb),
  });

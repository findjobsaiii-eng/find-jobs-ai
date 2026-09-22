import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: () => null,
  });
}

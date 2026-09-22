import * as Sentry from "@sentry/nextjs";
import { syncAnalyticsConsent } from "@/features/privacy/analytics";
import { readCookieConsent } from "@/features/privacy/cookie-consent";
import { scrubSentryEvent } from "@/lib/sentry-privacy";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: () => null,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (readCookieConsent()?.analytics) {
  void syncAnalyticsConsent(true);
}

import type { SessionRecordingOptions } from "posthog-js";
import { readCookieConsent } from "./cookie-consent";

type PostHogClient = typeof import("posthog-js").default;

// Preserve the UI's actual appearance and normal form interactions. Only
// credentials, embedded documents and explicitly private regions are excluded.
export const SESSION_REPLAY_OPTIONS = {
  blockClass: "ph-no-capture",
  maskTextClass: "ph-mask",
  maskAllInputs: false,
  maskInputOptions: { password: true },
  maskTextSelector: "[data-analytics-mask]",
  maskAllElementAttributes: false,
  blockSelector:
    'iframe, object, embed, canvas, input[type="file"], input[type="hidden"], [data-analytics-private]',
  inlineStylesheet: true,
  collectFonts: true,
  recordCrossOriginIframes: false,
  recordHeaders: false,
  recordBody: false,
  maskCapturedNetworkRequestFn: (request) => {
    // Preserve navigation context without storing OAuth codes/signed URL queries.
    try {
      const url = new URL(request.name, window.location.origin);
      return { ...request, name: `${url.origin}${url.pathname}` };
    } catch {
      return null;
    }
  },
} satisfies SessionRecordingOptions;

export type ProductAnalyticsEvent =
  | "job_feed_viewed"
  | "job_source_clicked"
  | "job_saved"
  | "application_status_changed"
  | "application_tracking_removed"
  | "profile_saved"
  | "onboarding_completed"
  | "resume_uploaded"
  | "deep_review_requested"
  | "email_preference_changed";

export type SafeEventProperties = {
  view?: "suggestions" | "in_progress";
  status?: string;
  source?: "app" | "email";
  frequency?: "daily" | "weekly" | "never";
  language?: "en" | "he";
  plan?: "free" | "pro" | "admin";
};

const PRODUCT_EVENTS = new Set<ProductAnalyticsEvent>([
  "job_feed_viewed",
  "job_source_clicked",
  "job_saved",
  "application_status_changed",
  "application_tracking_removed",
  "profile_saved",
  "onboarding_completed",
  "resume_uploaded",
  "deep_review_requested",
  "email_preference_changed",
]);

let client: PostHogClient | null = null;
let analyticsUserId: string | null = null;
let changeCount = 0;

function analyticsAllowed() {
  return readCookieConsent()?.analytics === true;
}

function identifyCurrentUser() {
  if (client && analyticsUserId && analyticsAllowed()) {
    client.identify(analyticsUserId);
  }
}

export async function syncAnalyticsConsent(analytics: boolean) {
  const change = ++changeCount;

  if (!analytics) {
    client?.stopSessionRecording();
    client?.opt_out_capturing();
    client?.reset();
    return;
  }

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!token || !host || !analyticsAllowed()) return;

  const { default: posthog } = await import("posthog-js");
  if (change !== changeCount || !analyticsAllowed()) return;

  if (!client) {
    posthog.init(token, {
      api_host: host,
      defaults: "2026-05-30",
      opt_out_capturing_by_default: true,
      persistence: "memory",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: false,
      enable_recording_console_log: false,
      capture_performance: false,
      session_recording: SESSION_REPLAY_OPTIONS,
      before_send: (event) => {
        if (!event) return null;
        if (event.event === "$snapshot" || event.event === "$identify") {
          return event;
        }
        if (event.event === "$pageview") {
          const path = window.location.pathname;
          return {
            ...event,
            properties: {
              token: event.properties?.token,
              distinct_id: event.properties?.distinct_id,
              $session_id: event.properties?.$session_id,
              $window_id: event.properties?.$window_id,
              $current_url: `${window.location.origin}${path}`,
              $pathname: path,
              $geoip_disable: true,
              $process_person_profile: Boolean(analyticsUserId),
            },
          };
        }
        if (!PRODUCT_EVENTS.has(event.event as ProductAnalyticsEvent)) {
          return null;
        }
        const safe = event.properties as SafeEventProperties | undefined;
        return {
          ...event,
          properties: {
            token: event.properties?.token,
            distinct_id: event.properties?.distinct_id,
            $session_id: event.properties?.$session_id,
            $window_id: event.properties?.$window_id,
            $geoip_disable: true,
            $process_person_profile: Boolean(analyticsUserId),
            ...(safe?.view ? { view: safe.view } : {}),
            ...(safe?.status ? { status: safe.status } : {}),
            ...(safe?.source ? { source: safe.source } : {}),
            ...(safe?.frequency ? { frequency: safe.frequency } : {}),
            ...(safe?.language ? { language: safe.language } : {}),
            ...(safe?.plan ? { plan: safe.plan } : {}),
          },
        };
      },
    });
    client = posthog;
  }

  client.opt_in_capturing();
  identifyCurrentUser();
  client.startSessionRecording();
  client.capture("$pageview");
}

export async function setAnalyticsIdentity(userId: string | null) {
  if (analyticsUserId === userId) return;
  analyticsUserId = userId;
  if (!userId) {
    client?.reset();
    return;
  }
  if (!client && analyticsAllowed()) await syncAnalyticsConsent(true);
  identifyCurrentUser();
}

export async function captureProductEvent(
  event: ProductAnalyticsEvent,
  properties: SafeEventProperties = {},
) {
  if (!analyticsAllowed()) return;
  if (!client) await syncAnalyticsConsent(true);
  identifyCurrentUser();
  client?.capture(event, properties);
}

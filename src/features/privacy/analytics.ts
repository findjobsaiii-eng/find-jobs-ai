import { readCookieConsent } from "./cookie-consent";

type PostHogClient = typeof import("posthog-js").default;

let client: PostHogClient | null = null;
let changeCount = 0;

export async function syncAnalyticsConsent(analytics: boolean) {
  const change = ++changeCount;

  if (!analytics) {
    client?.opt_out_capturing();
    return;
  }

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!token || !host || !readCookieConsent()?.analytics) return;

  const { default: posthog } = await import("posthog-js");
  if (change !== changeCount || !readCookieConsent()?.analytics) return;

  if (!client) {
    posthog.init(token, {
      api_host: host,
      defaults: "2026-05-30",
      opt_out_capturing_by_default: true,
      persistence: "memory",
      person_profiles: "never",
      capture_pageview: "history_change",
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      before_send: (event) => {
        if (event?.event !== "$pageview") return null;
        const path = window.location.pathname;
        return {
          ...event,
          properties: {
            token: event.properties?.token,
            distinct_id: event.properties?.distinct_id,
            $current_url: `${window.location.origin}${path}`,
            $pathname: path,
            $geoip_disable: true,
            $process_person_profile: false,
          },
        };
      },
    });
    client = posthog;
  }

  client.opt_in_capturing();
  client.capture("$pageview");
}

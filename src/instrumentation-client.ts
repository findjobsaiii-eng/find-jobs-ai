import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();

if (projectToken && host) {
  try {
    posthog.init(projectToken, {
      api_host: host,
      defaults: "2026-05-30",
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: true,
    });
  } catch (error) {
    console.error("PostHog initialization failed", error);
  }
}

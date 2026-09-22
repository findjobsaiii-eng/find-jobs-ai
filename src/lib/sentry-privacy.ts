import type { ErrorEvent } from "@sentry/nextjs";

// Keep error category and event ID for debugging, discard arbitrary application data.
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    message: "Application error (details removed)",
    exception: event.exception?.values?.length
      ? {
          values: event.exception.values.map((value) => ({ type: value.type })),
        }
      : undefined,
  };
}

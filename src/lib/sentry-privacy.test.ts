import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "./sentry-privacy";

describe("Sentry privacy boundary", () => {
  it("removes request, user, breadcrumbs and exception content", () => {
    const event = {
      type: undefined,
      event_id: "event-1",
      message: "Bearer secret-token",
      user: { email: "candidate@example.com" },
      request: { url: "https://jobmiter.com/profile?token=secret-token" },
      extra: { resumeText: "private CV" },
      breadcrumbs: [{ message: "private profile" }],
      exception: {
        values: [
          { type: "Error", value: "private CV", stacktrace: { frames: [] } },
        ],
      },
    } as ErrorEvent;

    const cleaned = scrubSentryEvent(event);
    expect(cleaned.event_id).toBe("event-1");
    expect(JSON.stringify(cleaned)).not.toMatch(
      /secret-token|candidate@example|private CV|private profile/,
    );
    expect(cleaned.exception?.values?.[0].type).toBe("Error");
  });
});

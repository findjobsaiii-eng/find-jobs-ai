import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "./sentry-privacy";

const userId = "j57abcdef0123456789abcdef01234567";
describe("Sentry privacy boundary", () => {
  it("preserves real errors, source-map identities, route and digest without request/profile payloads", () => {
    const event: ErrorEvent = {
      type: undefined,
      event_id: "event-1",
      release: "release-1",
      user: {
        id: userId,
        email: "candidate@example.com",
        ip_address: "192.0.2.1",
      },
      request: {
        url: "https://jobmiter.com/profile?token=secret#private",
        method: "GET",
        headers: { Cookie: "session=private" },
        data: "private CV",
      },
      tags: {
        digest: "12345",
        boundary: "route",
        candidateEmail: "candidate@example.com",
      },
      contexts: {
        nextjs: {
          router_kind: "App Router",
          route_type: "render",
          router_path: "/profile",
          request_path: "/profile?token=secret",
        },
        candidate: { resumeText: "private CV" },
      },
      extra: { resumeText: "private CV" },
      breadcrumbs: [{ message: "private profile" }],
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read properties of undefined (reading 'status')",
            mechanism: {
              type: "auto.function.nextjs.on_request_error",
              handled: false,
              data: { private: "private CV" },
            },
            stacktrace: {
              frames: [
                {
                  filename:
                    "https://jobmiter.com/_next/static/chunk.js?token=secret",
                  function: "loadProfile",
                  lineno: 42,
                  colno: 8,
                  debug_id: "debug-1",
                  vars: { resumeText: "private CV" },
                  context_line: "private CV",
                },
              ],
            },
          },
        ],
      },
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "debug-1",
            code_file: "https://jobmiter.com/_next/static/chunk.js",
          },
        ],
      },
    };
    const cleaned = scrubSentryEvent(event);
    expect(cleaned.exception?.values?.[0]).toMatchObject({
      type: "TypeError",
      value: "Cannot read properties of undefined (reading 'status')",
      stacktrace: {
        frames: [
          {
            function: "loadProfile",
            lineno: 42,
            colno: 8,
            debug_id: "debug-1",
          },
        ],
      },
    });
    expect(cleaned.debug_meta).toEqual(event.debug_meta);
    expect(cleaned.user).toEqual({ id: userId });
    expect(cleaned.tags).toEqual({ digest: "12345", boundary: "route" });
    expect(cleaned.request).toEqual({
      url: "https://jobmiter.com/profile",
      method: "GET",
    });
    expect(cleaned.contexts?.nextjs?.request_path).toBe("/profile");
    expect(JSON.stringify(cleaned)).not.toMatch(
      /secret|private CV|private profile|candidate@example|192\.0\.2\.1|Cookie/u,
    );
  });
  it("redacts sensitive values in error messages without destroying the failure category", () => {
    const cleaned = scrubSentryEvent({
      type: undefined,
      message:
        "Authentication failed for candidate@example.com: Bearer secret-token at https://user:password@jobmiter.com/profile?token=secret-token#private sk-secretApiKey",
    });
    expect(cleaned.message).toContain("Authentication failed");
    expect(cleaned.message).not.toMatch(
      /candidate@example|secret-token|password|secretApiKey|#private/u,
    );
  });
  it("removes complete Convex validation payloads while preserving the validation failure", () => {
    const cleaned = scrubSentryEvent({
      type: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value:
              'ReturnValidationError: result did not match validator.\nObject: {"education":"private history","resumeText":"private CV"}\nValidator: v.object(...)',
          },
        ],
      },
    });
    expect(cleaned.exception?.values?.[0].value).toContain(
      "ReturnValidationError",
    );
    expect(JSON.stringify(cleaned)).not.toMatch(/private history|private CV/u);
  });
  it("retains a digest on automatic SDK captures even without explicit scope tags", () => {
    const originalException = Object.assign(new Error("Server render failed"), {
      digest: "67890",
    });
    const cleaned = scrubSentryEvent(
      { type: undefined },
      { originalException },
    );
    expect(cleaned.tags?.digest).toBe("67890");
  });
  it("does not accept an email as a telemetry user ID", () => {
    expect(
      scrubSentryEvent({
        type: undefined,
        user: { id: "candidate@example.com" },
      }).user,
    ).toBeUndefined();
  });
});

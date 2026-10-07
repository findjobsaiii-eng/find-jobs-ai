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

it("keeps safe request and navigation breadcrumbs without bodies, secrets or click text", () => {
  const cleaned = scrubSentryEvent({
    type: undefined,
    breadcrumbs: [
      {
        category: "fetch",
        message: "private CV",
        data: {
          url: "https://jobmiter.com/api/auth?token=secret",
          method: "POST",
          status_code: 503,
          body: "private CV",
          headers: { Authorization: "Bearer secret" },
        },
      },
      {
        category: "navigation",
        data: { from: "/?code=secret", to: "/profile#private" },
      },
      { category: "console", message: "private CV" },
      { category: "ui.click", message: "candidate@example.com" },
    ],
  });
  expect(cleaned.breadcrumbs).toHaveLength(2);
  expect(cleaned.breadcrumbs?.[0].data).toMatchObject({
    url: "https://jobmiter.com/api/auth",
    method: "POST",
    status_code: 503,
  });
  expect(cleaned.breadcrumbs?.[1].data).toEqual({
    from: "https://jobmiter.com/",
    to: "https://jobmiter.com/profile",
  });
  expect(JSON.stringify(cleaned)).not.toMatch(
    /secret|private CV|candidate@example|Authorization/u,
  );
});

it("labels auth refresh network errors while retaining the exception and source stack", () => {
  const event: ErrorEvent = {
    type: undefined,
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Failed to fetch",
          mechanism: {
            type: "auto.browser.global_handlers.onunhandledrejection",
            handled: false,
          },
          stacktrace: {
            frames: [
              {
                filename: "node_modules/@convex-dev/auth/src/nextjs/client.tsx",
                lineno: 28,
              },
            ],
          },
        },
      ],
    },
  };
  const cleaned = scrubSentryEvent(event);
  expect(cleaned.tags?.error_category).toBe("auth_refresh_network");
  expect(cleaned.exception?.values?.[0].value).toBe("Failed to fetch");
  expect(cleaned.exception?.values?.[0].mechanism?.handled).toBe(false);
  expect(cleaned.exception?.values?.[0].stacktrace?.frames?.[0].lineno).toBe(
    28,
  );
  expect(cleaned.contexts?.app).toMatchObject({
    network_online: true,
    dom_translated: false,
  });
});

it("retains browser identification and translation diagnostics without credentials or arbitrary context", () => {
  document.documentElement.classList.add("translated-rtl");
  try {
    const cleaned = scrubSentryEvent({
      type: undefined,
      request: {
        url: "https://jobmiter.com/",
        headers: {
          "User-Agent": "Example Browser 123",
          Cookie: "secret",
          Authorization: "secret",
        },
      },
      contexts: { candidate: { resumeText: "private CV" } },
    });
    expect(cleaned.request?.headers).toEqual({
      "User-Agent": "Example Browser 123",
    });
    expect(cleaned.contexts?.app?.dom_translated).toBe(true);
    expect(JSON.stringify(cleaned)).not.toMatch(/secret|private CV|candidate/u);
  } finally {
    document.documentElement.classList.remove("translated-rtl");
  }
});

it("bounds safe breadcrumb history and does not mislabel unrelated fetch failures as auth failures", () => {
  const cleaned = scrubSentryEvent({
    type: undefined,
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Failed to fetch",
          stacktrace: {
            frames: [{ filename: "src/features/profile/upload.ts" }],
          },
        },
      ],
    },
    breadcrumbs: Array.from({ length: 40 }, (_, index) => ({
      category: "fetch",
      data: { url: `https://jobmiter.com/api/example/${index}` },
    })),
  });
  expect(cleaned.breadcrumbs).toHaveLength(25);
  expect(cleaned.tags?.error_category).toBeUndefined();
});

it("uses the SDK's failed auth-request breadcrumb before production source maps are applied", () => {
  const event: ErrorEvent = {
    type: undefined,
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Failed to fetch",
          stacktrace: {
            frames: [
              {
                filename: "https://jobmiter.com/_next/static/chunks/hashed.js",
                lineno: 1,
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        category: "fetch",
        level: "error",
        data: { url: "/api/auth", method: "POST" },
      },
    ],
  };
  expect(scrubSentryEvent(event).tags?.error_category).toBe(
    "auth_refresh_network",
  );
  const laterRequest = {
    category: "fetch",
    level: "error" as const,
    data: { url: "/api/upload", method: "POST" },
  };
  expect(
    scrubSentryEvent({
      ...event,
      breadcrumbs: [...event.breadcrumbs!, laterRequest],
    }).tags?.error_category,
  ).toBeUndefined();
});

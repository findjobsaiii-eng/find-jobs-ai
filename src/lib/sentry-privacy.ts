import { errorDiagnosticTags } from "./sentry-errors";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// Error diagnostics are useful; arbitrary application payloads are not telemetry.
// Keep an explicit allowlist rather than forwarding SDK contexts/extra wholesale.
export function redactDiagnosticText(value: string): string {
  return value
    .replace(
      /(?:^|\n)(?:Object|Value|Arguments|Request body|Response body|Resume text|Profile):[\s\S]*/iu,
      "\n[redacted payload]",
    )
    .replace(/Bearer\s+\S+/giu, "Bearer [redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/gu, "[redacted token]")
    .replace(
      /\b(?:sk|pk|rk|phc|phx|sntrys)_[\w-]+|\bsk-[\w-]+|\bAIza[\w-]{20,}/gu,
      "[redacted key]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, "[redacted email]")
    .replace(
      /\b(?:password|token|secret|resumeText|authorization)["']?\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      "[redacted field]",
    )
    .replace(
      /https?:\/\/[^\s"'<>]+/gu,
      (url) => safeUrl(url) ?? "[redacted URL]",
    )
    .slice(0, 2_000);
}

function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://jobmiter.com");
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    // OAuth callbacks have secrets in their query strings. Never retain any
    // query, fragment, URL credentials or data/blob URL contents.
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function safePath(value: unknown) {
  return typeof value === "string"
    ? redactDiagnosticText(value.split(/[?#]/u)[0])
    : undefined;
}

const allowedTags = [
  "boundary",
  "digest",
  "convex_function",
  "convex_request_id",
];

export function scrubSentryEvent(
  event: ErrorEvent,
  hint?: EventHint,
): ErrorEvent {
  const nextjs = event.contexts?.nextjs;
  const tags: Record<string, string> = {};
  const diagnostics = errorDiagnosticTags(hint?.originalException);
  for (const key of allowedTags) {
    const value = event.tags?.[key] ?? diagnostics[key];
    if (typeof value === "string") tags[key] = redactDiagnosticText(value);
  }
  const userId = event.user?.id;
  const safeUserId =
    typeof userId === "string" && /^[a-z0-9]{16,64}$/u.test(userId)
      ? userId
      : undefined;
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    dist: event.dist,
    sdk: event.sdk,
    message: event.message ? redactDiagnosticText(event.message) : undefined,
    transaction: safePath(event.transaction),
    tags,
    user: safeUserId ? { id: safeUserId } : undefined,
    request: event.request
      ? {
          url: event.request.url ? safeUrl(event.request.url) : undefined,
          method: event.request.method,
        }
      : undefined,
    contexts: nextjs
      ? {
          nextjs: {
            request_path: safePath(nextjs.request_path),
            router_path: safePath(nextjs.router_path),
            router_kind: safePath(nextjs.router_kind),
            route_type: safePath(nextjs.route_type),
          },
        }
      : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map((value) => ({
            type: value.type,
            value: value.value ? redactDiagnosticText(value.value) : undefined,
            mechanism: value.mechanism
              ? {
                  type: value.mechanism.type,
                  handled: value.mechanism.handled,
                  synthetic: value.mechanism.synthetic,
                }
              : undefined,
            stacktrace: value.stacktrace
              ? {
                  frames: value.stacktrace.frames?.map((frame) => ({
                    filename: safePath(frame.filename),
                    abs_path: safePath(frame.abs_path),
                    function: frame.function,
                    module: frame.module,
                    lineno: frame.lineno,
                    colno: frame.colno,
                    in_app: frame.in_app,
                    // Sentry uses the frame debug ID and debug images for source maps.
                    debug_id: frame.debug_id,
                  })),
                }
              : undefined,
          })),
        }
      : undefined,
    debug_meta: event.debug_meta
      ? {
          images: event.debug_meta.images
            ?.filter((image) => image.type === "sourcemap")
            .map((image) => ({
              type: "sourcemap" as const,
              debug_id: image.debug_id,
              code_file: safePath(image.code_file) ?? "",
            })),
        }
      : undefined,
  };
}

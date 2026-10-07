import { errorDiagnosticTags } from "./sentry-errors";
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/nextjs";

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

/** Keep request/route context without headers, bodies, form text or console logs. */
export function scrubSentryBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const data = crumb.data;
  if (crumb.category === "fetch" || crumb.category === "xhr") {
    const url = typeof data?.url === "string" ? safeUrl(data.url) : undefined;
    if (!url) return null;
    const method =
      typeof data?.method === "string" &&
      /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/iu.test(data.method)
        ? data.method.toUpperCase()
        : undefined;
    return {
      category: crumb.category,
      type: "http",
      level: crumb.level,
      timestamp: crumb.timestamp,
      data: {
        url,
        method,
        status_code:
          typeof data?.status_code === "number" &&
          Number.isInteger(data.status_code) &&
          data.status_code >= 0 &&
          data.status_code <= 599
            ? data.status_code
            : undefined,
      },
    };
  }
  if (crumb.category === "navigation") {
    const from =
      typeof data?.from === "string" ? safeUrl(data.from) : undefined;
    const to = typeof data?.to === "string" ? safeUrl(data.to) : undefined;
    if (!from && !to) return null;
    return {
      category: "navigation",
      timestamp: crumb.timestamp,
      data: { from, to },
    };
  }
  return null;
}

function browserDiagnostics() {
  if (typeof window === "undefined" || typeof document === "undefined")
    return undefined;
  return {
    network_online: window.navigator.onLine,
    page_visibility: document.visibilityState,
    ui_language: ["en", "he"].includes(document.documentElement.lang)
      ? document.documentElement.lang
      : undefined,
    dom_translated:
      document.documentElement.classList.contains("translated-ltr") ||
      document.documentElement.classList.contains("translated-rtl"),
  };
}

function errorCategory(event: ErrorEvent) {
  // Production frames are still hashed bundle URLs here; Sentry symbolicates
  // them after ingestion. The SDK's latest failed request supplies local context.
  const lastRequest = [...(event.breadcrumbs ?? [])]
    .reverse()
    .find((crumb) => crumb.category === "fetch" || crumb.category === "xhr");
  const lastUrl =
    typeof lastRequest?.data?.url === "string"
      ? safeUrl(lastRequest.data.url)
      : undefined;
  const failedAuthRequest =
    lastRequest?.level === "error" &&
    lastRequest.data?.method === "POST" &&
    (lastRequest.data.status_code === undefined ||
      lastRequest.data.status_code === 0) &&
    lastUrl !== undefined &&
    new URL(lastUrl).pathname.replace(/\/$/u, "") === "/api/auth";
  for (const error of event.exception?.values ?? []) {
    if (
      /(?:Failed to fetch|Load failed|NetworkError when attempting to fetch)/iu.test(
        error.value ?? "",
      ) &&
      (failedAuthRequest ||
        error.stacktrace?.frames?.some((frame) =>
          /@convex-dev\/auth\//u.test(frame.filename ?? frame.abs_path ?? ""),
        ))
    )
      return "auth_refresh_network";
    if (
      error.type === "NotFoundError" &&
      /(?:insertBefore|removeChild)/u.test(error.value ?? "")
    )
      return "dom_mutation";
    if (error.type === "ChunkLoadError") return "chunk_load";
  }
  return undefined;
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
  const app = browserDiagnostics();
  const tags: Record<string, string> = {};
  const diagnostics = errorDiagnosticTags(hint?.originalException);
  for (const key of allowedTags) {
    const value = event.tags?.[key] ?? diagnostics[key];
    if (typeof value === "string") tags[key] = redactDiagnosticText(value);
  }
  const category = errorCategory(event);
  if (category) tags.error_category = category;
  const agent = Object.entries(event.request?.headers ?? {}).find(
    ([key]) => key.toLowerCase() === "user-agent",
  )?.[1];
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
          headers:
            typeof agent === "string"
              ? { "User-Agent": redactDiagnosticText(agent) }
              : undefined,
        }
      : undefined,
    contexts:
      nextjs || app
        ? {
            ...(app ? { app } : {}),
            ...(nextjs
              ? {
                  nextjs: {
                    request_path: safePath(nextjs.request_path),
                    router_path: safePath(nextjs.router_path),
                    router_kind: safePath(nextjs.router_kind),
                    route_type: safePath(nextjs.route_type),
                  },
                }
              : {}),
          }
        : undefined,
    breadcrumbs: event.breadcrumbs
      ?.map(scrubSentryBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null)
      .slice(-25),
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

import * as Sentry from "@sentry/nextjs";

export function errorDiagnosticTags(error: unknown) {
  const tags: Record<string, string> = {};
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string"
  ) {
    tags.digest = error.digest;
  }
  if (error instanceof Error) {
    const convexFunction = error.message.match(
      /\[CONVEX [QMA]\(([^)]+)\)\]/u,
    )?.[1];
    const requestId = error.message.match(
      /\[Request ID: ([a-z0-9-]+)\]/iu,
    )?.[1];
    if (convexFunction) tags.convex_function = convexFunction;
    if (requestId) tags.convex_request_id = requestId;
  }
  return tags;
}

export function captureBoundaryError(error: unknown, boundary: string) {
  return Sentry.captureException(error, {
    tags: { boundary, ...errorDiagnosticTags(error) },
  });
}

export function recoverBoundaryError(
  error: Error,
  retry: () => void,
  reload: () => void = () => window.location.reload(),
) {
  const staleChunk =
    error.name === "ChunkLoadError" ||
    /(?:Loading chunk \S+ failed|Failed to load chunk\b)/iu.test(error.message);
  const brokenDom =
    error.name === "NotFoundError" &&
    /Failed to execute '(?:insertBefore|removeChild)' on 'Node'/u.test(
      error.message,
    );
  // These failures retain a broken module/DOM tree across a segment retry.
  // Reload only on an explicit Retry click, never automatically in a loop.
  if (staleChunk || brokenDom) reload();
  else retry();
}

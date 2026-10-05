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

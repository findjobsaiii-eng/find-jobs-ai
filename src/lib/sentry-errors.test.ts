import { expect, it, vi } from "vitest";
import { captureBoundaryError, errorDiagnosticTags } from "./sentry-errors";
import * as Sentry from "@sentry/nextjs";
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
it("retains the Next server digest for matching the client fallback to its server event", () => {
  const error = Object.assign(new Error("Sanitized server component error"), {
    digest: "12345",
  });
  captureBoundaryError(error, "route");
  expect(Sentry.captureException).toHaveBeenCalledWith(error, {
    tags: { boundary: "route", digest: "12345" },
  });
});
it("labels Convex query failures with their function and request IDs", () => {
  expect(
    errorDiagnosticTags(
      new Error(
        "[CONVEX Q(jobDiscovery:listCurrentUserJobs)] [Request ID: abcdef1234] Server Error",
      ),
    ),
  ).toEqual({
    convex_function: "jobDiscovery:listCurrentUserJobs",
    convex_request_id: "abcdef1234",
  });
});

it("uses a full reload to recover a stale chunk or externally broken DOM after an explicit retry", async () => {
  const { recoverBoundaryError } = await import("./sentry-errors");
  for (const error of [
    Object.assign(new Error("Loading chunk 12 failed"), {
      name: "ChunkLoadError",
    }),
    new Error("Failed to load chunk /_next/static/example.js"),
    new DOMException(
      "Failed to execute 'insertBefore' on 'Node': The reference node is not a child.",
      "NotFoundError",
    ),
  ]) {
    const retry = vi.fn(),
      reload = vi.fn();
    recoverBoundaryError(error, retry, reload);
    expect(reload).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  }
});

it("keeps ordinary server, network and unrelated not-found errors on normal segment retry", async () => {
  const { recoverBoundaryError } = await import("./sentry-errors");
  for (const error of [
    new Error("Server render failed"),
    new TypeError("Failed to fetch"),
    new DOMException("Resource not found", "NotFoundError"),
  ]) {
    const retry = vi.fn(),
      reload = vi.fn();
    recoverBoundaryError(error, retry, reload);
    expect(retry).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  }
});

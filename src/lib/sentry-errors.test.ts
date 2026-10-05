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

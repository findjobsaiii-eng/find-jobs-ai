import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../convex/_generated/api";
import type { Instrumentation } from "next";
import { errorDiagnosticTags } from "./lib/sentry-errors";
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  let userId: string | null = null;
  // Best effort: verify the session through Convex, not by trusting cookie/JWT claims.
  if (Sentry.getClient()) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const identity = (async () => {
        const token = await convexAuthNextjsToken();
        return token
          ? await fetchQuery(api.telemetry.getCurrentUserId, {}, { token })
          : null;
      })();
      userId = await Promise.race([
        identity,
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 500);
        }),
      ]);
    } catch {
      // Authentication/request-context failures must never prevent error capture.
    } finally {
      clearTimeout(timeout);
    }
  }
  Sentry.withScope((scope) => {
    scope.setTags(errorDiagnosticTags(error));
    scope.setUser(userId ? { id: userId } : null);
    Sentry.captureRequestError(error, request, context);
  });
};

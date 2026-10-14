"use client";
import { useEffect } from "react";
import { useConvexAuth, useQueries } from "convex/react";
import * as Sentry from "@sentry/nextjs";
import { api } from "../../../convex/_generated/api";
import { captureBoundaryError } from "@/lib/sentry-errors";

export function SentryUserSync() {
  const { isAuthenticated } = useConvexAuth();
  // Unlike useQuery, useQueries returns a query error instead of throwing it
  // through the root layout. Diagnostic identity is not required to use the app.
  const { userId }: { userId?: unknown } = useQueries(
    isAuthenticated
      ? { userId: { query: api.telemetry.getCurrentUserId, args: {} } }
      : {},
  );
  useEffect(() => {
    Sentry.setUser(
      isAuthenticated && typeof userId === "string" ? { id: userId } : null,
    );
    if (isAuthenticated && userId instanceof Error)
      captureBoundaryError(userId, "telemetry-identity");
    return () => {
      Sentry.setUser(null);
    };
  }, [isAuthenticated, userId]);
  return null;
}

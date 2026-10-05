"use client";
import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import * as Sentry from "@sentry/nextjs";
import { api } from "../../../convex/_generated/api";

export function SentryUserSync() {
  const { isAuthenticated } = useConvexAuth();
  const userId = useQuery(
    api.telemetry.getCurrentUserId,
    isAuthenticated ? {} : "skip",
  );
  useEffect(() => {
    Sentry.setUser(isAuthenticated && userId ? { id: userId } : null);
    return () => {
      Sentry.setUser(null);
    };
  }, [isAuthenticated, userId]);
  return null;
}

"use client";

import { useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import {
  captureProductEvent,
  setAnalyticsIdentity,
  type ProductAnalyticsEvent,
  type SafeEventProperties,
} from "./analytics";

export function ProductAnalyticsIdentity({ userId }: { userId: Id<"users"> }) {
  const recordEvent = useMutation(api.productAnalytics.recordClientEvent);

  useEffect(() => {
    void setAnalyticsIdentity(userId);
    void recordEvent({ event: "app_visited" });
  }, [recordEvent, userId]);

  return null;
}

export function useProductEvent() {
  const recordEvent = useMutation(api.productAnalytics.recordClientEvent);
  return useCallback(
    (
      event: ProductAnalyticsEvent,
      properties: SafeEventProperties & { jobId?: Id<"jobs"> } = {},
    ) => {
      void captureProductEvent(event, {
        ...(properties.view ? { view: properties.view } : {}),
        ...(properties.status ? { status: properties.status } : {}),
        ...(properties.source ? { source: properties.source } : {}),
        ...(properties.frequency ? { frequency: properties.frequency } : {}),
        ...(properties.language ? { language: properties.language } : {}),
        ...(properties.plan ? { plan: properties.plan } : {}),
      });
      if (event === "job_feed_viewed" || event === "job_source_clicked") {
        void recordEvent({
          event,
          ...(properties.jobId ? { jobId: properties.jobId } : {}),
          ...(properties.view ? { view: properties.view } : {}),
          ...(properties.source ? { source: properties.source } : {}),
        });
      }
    },
    [recordEvent],
  );
}

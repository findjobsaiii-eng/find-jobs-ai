"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "motion/react";
import { JobmiterMark } from "@/components/ui/jobmiter-logo";
import { AuthConfigurationErrorScreen } from "@/features/auth/auth-configuration-error-screen";
import { AuthFlowProvider } from "@/features/auth/auth-flow-provider";
import i18n, { initializeI18n } from "@/i18n";
import { parseConvexUrl } from "./convex-url";

export function AppProviders({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl?: string;
}) {
  const [i18nReady, setI18nReady] = useState(i18n.isInitialized);
  const parsedConvexUrl = parseConvexUrl(convexUrl);
  const convex = useMemo(
    () => (parsedConvexUrl ? new ConvexReactClient(parsedConvexUrl) : null),
    [parsedConvexUrl],
  );

  useEffect(() => {
    let active = true;
    void initializeI18n().then(() => {
      if (active) setI18nReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!i18nReady) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="bg-brand-snow grid min-h-svh place-items-center"
      >
        <span className="relative grid size-24 place-items-center">
          <span
            aria-hidden="true"
            className="border-brand-electric/20 absolute inset-0 rounded-full border motion-safe:animate-pulse"
          />
          <JobmiterMark className="size-14" />
        </span>
      </div>
    );
  }

  const content = <MotionConfig reducedMotion="user">{children}</MotionConfig>;

  if (!convex) {
    return (
      <MotionConfig reducedMotion="user">
        <AuthConfigurationErrorScreen />
      </MotionConfig>
    );
  }

  return (
    <ConvexAuthNextjsProvider client={convex}>
      <AuthFlowProvider>{content}</AuthFlowProvider>
    </ConvexAuthNextjsProvider>
  );
}

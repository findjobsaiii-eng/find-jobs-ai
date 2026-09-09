"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "motion/react";
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
        className="bg-background min-h-svh"
      />
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
    <ConvexAuthProvider client={convex} shouldHandleCode={false}>
      <AuthFlowProvider>{content}</AuthFlowProvider>
    </ConvexAuthProvider>
  );
}

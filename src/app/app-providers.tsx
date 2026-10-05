"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "motion/react";
import { I18nextProvider } from "react-i18next";
import { AuthConfigurationErrorScreen } from "@/features/auth/auth-configuration-error-screen";
import { AuthFlowProvider } from "@/features/auth/auth-flow-provider";
import { SentryUserSync } from "@/features/auth/sentry-user-sync";
import { ReminderLanguageSync } from "@/features/auth/reminder-language-sync";
import { CookieConsentManager } from "@/features/privacy/cookie-consent-manager";
import { InterfaceSoundsProvider } from "@/features/interface-sounds/interface-sounds-provider";
import { parseConvexUrl } from "./convex-url";
import i18n from "@/i18n";

export function AppProviders({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl?: string;
}) {
  const parsedConvexUrl = parseConvexUrl(convexUrl);
  const convex = useMemo(
    () => (parsedConvexUrl ? new ConvexReactClient(parsedConvexUrl) : null),
    [parsedConvexUrl],
  );

  const content = (
    <MotionConfig reducedMotion="user">
      <InterfaceSoundsProvider>
        <CookieConsentManager>{children}</CookieConsentManager>
      </InterfaceSoundsProvider>
    </MotionConfig>
  );

  if (!convex) {
    return (
      <I18nextProvider i18n={i18n}>
        <MotionConfig reducedMotion="user">
          <AuthConfigurationErrorScreen />
        </MotionConfig>
      </I18nextProvider>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <ConvexAuthNextjsProvider client={convex}>
        <AuthFlowProvider>
          <SentryUserSync />
          <ReminderLanguageSync />
          {content}
        </AuthFlowProvider>
      </ConvexAuthNextjsProvider>
    </I18nextProvider>
  );
}

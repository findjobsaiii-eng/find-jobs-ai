"use client";

import { useEffect, type ReactNode } from "react";
import { initializeI18n } from "@/i18n";
import { useConvexAuth } from "convex/react";
import { AuthCallbackErrorScreen } from "./auth-callback-error-screen";
import type { AuthCallbackStatus } from "./auth-flow-context";
import { useAuthFlow } from "./auth-flow-context";
import { AuthLoadingScreen } from "./auth-loading-screen";

type AuthGateProps = {
  isAuthenticated: boolean;
  isLoading: boolean;
  initiallyAuthenticated?: boolean;
  publicWhileLoading?: boolean;
  callbackStatus: AuthCallbackStatus;
  onDismissCallbackError: () => void;
  unauthenticated: ReactNode;
  children: ReactNode;
};

export function AuthGate({
  isAuthenticated,
  isLoading,
  initiallyAuthenticated = false,
  publicWhileLoading = false,
  callbackStatus,
  onDismissCallbackError,
  unauthenticated,
  children,
}: AuthGateProps) {
  if (
    publicWhileLoading &&
    !initiallyAuthenticated &&
    !isAuthenticated &&
    (callbackStatus === "initializing" ||
      (callbackStatus === "idle" && isLoading))
  )
    return unauthenticated;

  if (
    callbackStatus === "initializing" ||
    callbackStatus === "exchanging" ||
    callbackStatus === "awaiting-session"
  ) {
    return <AuthLoadingScreen variant="callback" />;
  }

  if (callbackStatus === "error") {
    return <AuthCallbackErrorScreen onTryAgain={onDismissCallbackError} />;
  }

  if (isLoading) {
    return initiallyAuthenticated ? (
      children
    ) : (
      <AuthLoadingScreen variant="session" />
    );
  }

  return isAuthenticated ? children : unauthenticated;
}

export function AuthBoundary({
  unauthenticated,
  children,
  initiallyAuthenticated = false,
  publicWhileLoading = false,
}: {
  unauthenticated: ReactNode;
  children: ReactNode;
  initiallyAuthenticated?: boolean;
  publicWhileLoading?: boolean;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const authFlow = useAuthFlow();
  // Restore the saved language only once this route's content has hydrated.
  // A root-provider effect can run before a streamed page hydrates.
  useEffect(() => {
    void initializeI18n();
  }, []);

  return (
    <AuthGate
      isAuthenticated={isAuthenticated}
      isLoading={isLoading}
      initiallyAuthenticated={initiallyAuthenticated}
      publicWhileLoading={publicWhileLoading}
      callbackStatus={authFlow.status}
      onDismissCallbackError={authFlow.dismissCallbackError}
      unauthenticated={unauthenticated}
    >
      {children}
    </AuthGate>
  );
}

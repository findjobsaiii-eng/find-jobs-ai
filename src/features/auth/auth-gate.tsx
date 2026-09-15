"use client";

import type { ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { AuthCallbackErrorScreen } from "./auth-callback-error-screen";
import type { AuthCallbackStatus } from "./auth-flow-context";
import { useAuthFlow } from "./auth-flow-context";
import { AuthLoadingScreen } from "./auth-loading-screen";

type AuthGateProps = {
  isAuthenticated: boolean;
  isLoading: boolean;
  initiallyAuthenticated?: boolean;
  callbackStatus: AuthCallbackStatus;
  onDismissCallbackError: () => void;
  unauthenticated: ReactNode;
  children: ReactNode;
};

export function AuthGate({
  isAuthenticated,
  isLoading,
  initiallyAuthenticated = false,
  callbackStatus,
  onDismissCallbackError,
  unauthenticated,
  children,
}: AuthGateProps) {
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
}: {
  unauthenticated: ReactNode;
  children: ReactNode;
  initiallyAuthenticated?: boolean;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const authFlow = useAuthFlow();

  return (
    <AuthGate
      isAuthenticated={isAuthenticated}
      isLoading={isLoading}
      initiallyAuthenticated={initiallyAuthenticated}
      callbackStatus={authFlow.status}
      onDismissCallbackError={authFlow.dismissCallbackError}
      unauthenticated={unauthenticated}
    >
      {children}
    </AuthGate>
  );
}

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
  callbackStatus: AuthCallbackStatus;
  onDismissCallbackError: () => void;
  unauthenticated: ReactNode;
  children: ReactNode;
};

export function AuthGate({
  isAuthenticated,
  isLoading,
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
    return <AuthLoadingScreen variant="session" />;
  }

  return isAuthenticated ? children : unauthenticated;
}

export function AuthBoundary({
  unauthenticated,
  children,
}: {
  unauthenticated: ReactNode;
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const authFlow = useAuthFlow();

  return (
    <AuthGate
      isAuthenticated={isAuthenticated}
      isLoading={isLoading}
      callbackStatus={authFlow.status}
      onDismissCallbackError={authFlow.dismissCallbackError}
      unauthenticated={unauthenticated}
    >
      {children}
    </AuthGate>
  );
}

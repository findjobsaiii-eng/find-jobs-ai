"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvexAuth } from "convex/react";
import { AuthFlowContext, type AuthCallbackStatus } from "./auth-flow-context";
import {
  clearOAuthAttemptPending,
  hasOAuthAttemptPending,
} from "./oauth-callback";

const subscribeToBrowserAvailability = () => () => undefined;

function useBrowserAvailable() {
  return useSyncExternalStore(
    subscribeToBrowserAvailability,
    () => true,
    () => false,
  );
}

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const browserAvailable = useBrowserAvailable();
  const [dismissedPendingAttempt, setDismissedPendingAttempt] = useState(false);
  const hasUnresolvedAttempt =
    browserAvailable &&
    !dismissedPendingAttempt &&
    hasOAuthAttemptPending(window.sessionStorage);

  useEffect(() => {
    if (isAuthenticated && browserAvailable) {
      clearOAuthAttemptPending(window.sessionStorage);
    }
  }, [browserAvailable, isAuthenticated]);

  const dismissCallbackError = useCallback(() => {
    clearOAuthAttemptPending(window.sessionStorage);
    setDismissedPendingAttempt(true);
  }, []);

  let visibleStatus: AuthCallbackStatus = "idle";
  if (!browserAvailable) {
    visibleStatus = "initializing";
  } else if (hasUnresolvedAttempt && !isAuthenticated) {
    visibleStatus = isLoading ? "awaiting-session" : "error";
  }
  const value = useMemo(
    () => ({ status: visibleStatus, dismissCallbackError }),
    [dismissCallbackError, visibleStatus],
  );

  return (
    <AuthFlowContext.Provider value={value}>
      {children}
    </AuthFlowContext.Provider>
  );
}

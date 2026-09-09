"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { AuthFlowContext, type AuthCallbackStatus } from "./auth-flow-context";
import {
  clearOAuthAttemptPending,
  getOAuthCallbackCode,
  hasOAuthAttemptPending,
  removeOAuthCallbackCode,
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
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const browserAvailable = useBrowserAvailable();
  const exchangeStarted = useRef(false);
  const [status, setStatus] =
    useState<Exclude<AuthCallbackStatus, "initializing" | "exchanging">>(
      "idle",
    );
  const [dismissedPendingAttempt, setDismissedPendingAttempt] = useState(false);
  const code = browserAvailable
    ? getOAuthCallbackCode(window.location.search)
    : null;
  const hasUnresolvedAttempt =
    browserAvailable &&
    !dismissedPendingAttempt &&
    hasOAuthAttemptPending(window.sessionStorage);

  useEffect(() => {
    if (!code || exchangeStarted.current) {
      return;
    }

    exchangeStarted.current = true;
    clearOAuthAttemptPending(window.sessionStorage);
    window.history.replaceState(
      null,
      "",
      removeOAuthCallbackCode(window.location),
    );

    // Convex Auth uses an omitted provider name when exchanging an OAuth code,
    // although its public action type currently requires a string.
    void signIn(undefined as never, { code })
      .then(({ signingIn }) => {
        setStatus(signingIn ? "awaiting-session" : "error");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [code, signIn]);

  const dismissCallbackError = useCallback(() => {
    clearOAuthAttemptPending(window.sessionStorage);
    setDismissedPendingAttempt(true);
    setStatus("idle");
  }, []);

  let visibleStatus: AuthCallbackStatus = status;
  if (!browserAvailable) {
    visibleStatus = "initializing";
  } else if (code && status === "idle") {
    visibleStatus = "exchanging";
  } else if (hasUnresolvedAttempt && status === "idle") {
    visibleStatus = "error";
  } else if (status === "awaiting-session" && isAuthenticated) {
    visibleStatus = "idle";
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

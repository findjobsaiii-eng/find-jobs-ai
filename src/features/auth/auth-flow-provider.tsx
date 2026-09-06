import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

function getInitialCallbackState() {
  if (getOAuthCallbackCode(window.location.search)) {
    return "exchanging";
  }

  return hasOAuthAttemptPending(window.sessionStorage) ? "error" : "idle";
}

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const callbackCode = useRef(getOAuthCallbackCode(window.location.search));
  const exchangeStarted = useRef(false);
  const [status, setStatus] = useState<AuthCallbackStatus>(
    getInitialCallbackState,
  );

  useEffect(() => {
    const code = callbackCode.current;

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
  }, [signIn]);

  const dismissCallbackError = useCallback(() => {
    clearOAuthAttemptPending(window.sessionStorage);
    setStatus("idle");
  }, []);

  const visibleStatus =
    status === "awaiting-session" && isAuthenticated ? "idle" : status;
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

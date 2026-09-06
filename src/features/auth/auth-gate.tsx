import { AuthCallbackErrorScreen } from "./auth-callback-error-screen";
import type { AuthCallbackStatus } from "./auth-flow-context";
import { AuthLoadingScreen } from "./auth-loading-screen";
import { ProfileGate } from "@/features/profile/profile-gate";
import { SignInScreen } from "./sign-in-screen";

type AuthGateProps = {
  isAuthenticated: boolean;
  isLoading: boolean;
  callbackStatus: AuthCallbackStatus;
  onDismissCallbackError: () => void;
};

export function AuthGate({
  isAuthenticated,
  isLoading,
  callbackStatus,
  onDismissCallbackError,
}: AuthGateProps) {
  if (
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

  return isAuthenticated ? <ProfileGate /> : <SignInScreen />;
}

import { createContext, useContext } from "react";

export type AuthCallbackStatus =
  "idle" | "exchanging" | "awaiting-session" | "error";

export type AuthFlowContextValue = {
  status: AuthCallbackStatus;
  dismissCallbackError: () => void;
};

export const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

export function useAuthFlow() {
  const context = useContext(AuthFlowContext);

  if (!context) {
    throw new Error("useAuthFlow must be used within AuthFlowProvider");
  }

  return context;
}

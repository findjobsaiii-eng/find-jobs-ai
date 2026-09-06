import { useConvexAuth } from "convex/react";
import { AuthGate } from "@/features/auth/auth-gate";
import { useAuthFlow } from "@/features/auth/auth-flow-context";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const authFlow = useAuthFlow();

  return (
    <AuthGate
      isAuthenticated={isAuthenticated}
      isLoading={isLoading}
      callbackStatus={authFlow.status}
      onDismissCallbackError={authFlow.dismissCallbackError}
    />
  );
}

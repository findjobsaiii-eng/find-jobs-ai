import type { ReactNode } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "motion/react";
import { AuthConfigurationErrorScreen } from "@/features/auth/auth-configuration-error-screen";
import { AuthFlowProvider } from "@/features/auth/auth-flow-provider";
import { parseConvexUrl } from "./convex-url";

const convexUrl: unknown = import.meta.env.VITE_CONVEX_URL;
const parsedConvexUrl = parseConvexUrl(convexUrl);
const convex = parsedConvexUrl ? new ConvexReactClient(parsedConvexUrl) : null;

export function AppProviders({ children }: { children: ReactNode }) {
  const content = <MotionConfig reducedMotion="user">{children}</MotionConfig>;

  if (!convex) {
    return (
      <MotionConfig reducedMotion="user">
        <AuthConfigurationErrorScreen />
      </MotionConfig>
    );
  }

  return (
    <ConvexAuthProvider client={convex} shouldHandleCode={false}>
      <AuthFlowProvider>{content}</AuthFlowProvider>
    </ConvexAuthProvider>
  );
}

import type { ReactNode } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "motion/react";

const convexUrl: unknown = import.meta.env.VITE_CONVEX_URL;
const convex =
  typeof convexUrl === "string" && convexUrl.length > 0
    ? new ConvexReactClient(convexUrl)
    : null;

export function AppProviders({ children }: { children: ReactNode }) {
  const content = <MotionConfig reducedMotion="user">{children}</MotionConfig>;

  if (!convex) {
    return content;
  }

  return <ConvexAuthProvider client={convex}>{content}</ConvexAuthProvider>;
}

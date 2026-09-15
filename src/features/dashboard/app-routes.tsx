"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthBoundary } from "@/features/auth/auth-gate";
import { SignInScreen } from "@/features/auth/sign-in-screen";
import { LandingPage } from "@/features/landing/landing-page";
import {
  ProfileProvider,
  useCurrentProfile,
} from "@/features/profile/profile-context";
import { ProfileGate } from "@/features/profile/profile-gate";
import { ProfileOverview } from "@/features/profile/profile-overview";
import type { ProfileSection } from "@/features/profile/profile-section";
import { AuthenticatedShell } from "./authenticated-shell";
import { DashboardLoadingScreen, DashboardScreen } from "./dashboard-screen";

export type JobView = "suggestions" | "inProgress";

export function HomeRoute({
  view,
  initiallyAuthenticated = false,
}: {
  view: JobView;
  initiallyAuthenticated?: boolean;
}) {
  const router = useRouter();
  const loading = (
    <AuthenticatedShell currentPage="jobs" jobView={view}>
      <DashboardLoadingScreen view={view} />
    </AuthenticatedShell>
  );

  return (
    <AuthBoundary
      unauthenticated={<LandingPage />}
      initiallyAuthenticated={initiallyAuthenticated}
    >
      <ProfileGate loading={loading}>
        {(data) => (
          <ProfileProvider data={data}>
            <AuthenticatedShell data={data} currentPage="jobs" jobView={view}>
              <DashboardScreen
                view={view}
                onEdit={() => router.push("/profile")}
              />
            </AuthenticatedShell>
          </ProfileProvider>
        )}
      </ProfileGate>
    </AuthBoundary>
  );
}

export function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPage = pathname.startsWith("/profile") ? "profile" : "jobs";

  return (
    <AuthBoundary unauthenticated={<SignInScreen />}>
      <ProfileGate>
        {(data) => (
          <ProfileProvider data={data}>
            <AuthenticatedShell data={data} currentPage={currentPage}>
              {children}
            </AuthenticatedShell>
          </ProfileProvider>
        )}
      </ProfileGate>
    </AuthBoundary>
  );
}

export function ProfileRoute({ section }: { section: ProfileSection }) {
  const data = useCurrentProfile();
  return <ProfileOverview data={data} activeSection={section} />;
}

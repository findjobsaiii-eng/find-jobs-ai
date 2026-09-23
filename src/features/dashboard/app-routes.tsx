"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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

function viewFromSearch(search: string): JobView {
  return new URLSearchParams(search).get("tab") === "in-progress"
    ? "inProgress"
    : "suggestions";
}

export function useJobViewNavigation(initialView: JobView) {
  const [view, setView] = useState(initialView);

  useEffect(() => {
    const syncFromHistory = () =>
      setView(viewFromSearch(window.location.search));
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const selectView = useCallback((nextView: JobView) => {
    setView(nextView);

    if (viewFromSearch(window.location.search) === nextView) return;

    const url = new URL(window.location.href);
    if (nextView === "inProgress") {
      url.searchParams.set("tab", "in-progress");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.pushState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  return { view, selectView };
}

export function HomeRoute({
  view,
  initiallyAuthenticated = false,
}: {
  view: JobView;
  initiallyAuthenticated?: boolean;
}) {
  const router = useRouter();
  const jobNavigation = useJobViewNavigation(view);
  const loading = (
    <AuthenticatedShell
      currentPage="jobs"
      jobView={jobNavigation.view}
      onJobViewChange={jobNavigation.selectView}
    >
      <DashboardLoadingScreen view={jobNavigation.view} />
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
            <AuthenticatedShell
              data={data}
              currentPage="jobs"
              jobView={jobNavigation.view}
              onJobViewChange={jobNavigation.selectView}
            >
              <DashboardScreen
                view={jobNavigation.view}
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

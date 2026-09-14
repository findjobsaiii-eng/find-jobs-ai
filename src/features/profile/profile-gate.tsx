"use client";

import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AuthLoadingScreen } from "@/features/auth/auth-loading-screen";
import { AuthShell } from "@/features/auth/auth-shell";
import { OnboardingScreen } from "./onboarding-screen";
import { ResumeOnboarding } from "./resume-onboarding";
import type { CurrentProfile } from "./profile-types";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

class ProfileErrorBoundary extends Component<
  ErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Convex reports query failures to the console with request context.
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function ProfileRoute({
  children,
}: {
  children: (data: CurrentProfile) => ReactNode;
}) {
  const [manualEntry, setManualEntry] = useState(false);
  const profileState = useQuery(api.candidateProfiles.getCurrent);
  const resume = useQuery(api.resumes.getCurrent);
  if (profileState === undefined || resume === undefined) {
    return <AuthLoadingScreen variant="profile" />;
  }
  if (
    profileState.profile?.onboardingCompleted &&
    !profileState.profile.cvReviewPending
  ) {
    return children(profileState);
  }

  const resumeReady =
    resume?.status === "ready" || resume?.status === "needs_confirmation";

  return manualEntry || resumeReady ? (
    <OnboardingScreen initialData={profileState} resumeReview={resumeReady} />
  ) : (
    <ResumeOnboarding
      resume={resume}
      onEdit={() => setManualEntry(true)}
      onManualEntry={() => setManualEntry(true)}
    />
  );
}

export function ProfileGate({
  children,
}: {
  children: (data: CurrentProfile) => ReactNode;
}) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const fallback = (
    <AuthShell>
      <section
        className="max-w-md text-center"
        aria-labelledby="profile-error-title"
      >
        <AlertCircle
          aria-hidden="true"
          className="text-destructive mx-auto mb-5 size-10"
        />
        <h1 id="profile-error-title" className="text-2xl font-semibold">
          {t("onboarding.loadErrorTitle")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          {t("onboarding.loadErrorDescription")}
        </p>
        <Button
          className="mt-6"
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw aria-hidden="true" />
          {t("onboarding.retry")}
        </Button>
      </section>
    </AuthShell>
  );

  return (
    <ProfileErrorBoundary key={attempt} fallback={fallback}>
      <ProfileRoute>{children}</ProfileRoute>
    </ProfileErrorBoundary>
  );
}

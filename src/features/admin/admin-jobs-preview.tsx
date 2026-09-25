"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Eye, ShieldAlert, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AuthBoundary } from "@/features/auth/auth-gate";
import { SignInScreen } from "@/features/auth/sign-in-screen";
import { ProfileProvider } from "@/features/profile/profile-context";
import { AuthenticatedShell } from "@/features/dashboard/authenticated-shell";
import {
  DashboardLoadingScreen,
  DashboardScreen,
} from "@/features/dashboard/dashboard-screen";
import {
  type JobView,
  useJobViewNavigation,
} from "@/features/dashboard/app-routes";

function PreviewToolbar({ displayName }: { displayName: string }) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex min-h-12 max-w-[96rem] items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <Eye aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate font-semibold">
            {t("admin.preview.banner", { name: displayName })}
          </span>
          <span className="hidden text-amber-800 sm:inline">
            {t("admin.preview.readOnly")}
          </span>
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-amber-950 hover:bg-amber-100"
          render={<Link href="/admin" />}
        >
          <ArrowLeft aria-hidden="true" />
          {t("admin.preview.exit")}
        </Button>
      </div>
    </div>
  );
}

function MissingUser() {
  const { t } = useTranslation();

  return (
    <div className="bg-brand-snow grid min-h-svh place-items-center p-6">
      <section className="bg-card border-border max-w-md rounded-3xl border p-8 text-center shadow-lg">
        <ShieldAlert
          aria-hidden="true"
          className="text-muted-foreground mx-auto size-10"
        />
        <h1 className="mt-5 text-xl font-semibold">
          {t("admin.preview.notFoundTitle")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {t("admin.preview.notFoundDescription")}
        </p>
        <Button className="mt-6" render={<Link href="/admin" />}>
          <ArrowLeft aria-hidden="true" />
          {t("admin.preview.exit")}
        </Button>
      </section>
    </div>
  );
}

function JobsUnavailable({ displayName }: { displayName: string }) {
  const { t } = useTranslation();

  return (
    <>
      <PreviewToolbar displayName={displayName} />
      <div className="bg-brand-snow grid min-h-[calc(100svh-3rem)] place-items-center p-6">
        <section className="bg-card border-border max-w-md rounded-3xl border p-8 text-center shadow-lg">
          <UserRound
            aria-hidden="true"
            className="text-muted-foreground mx-auto size-10"
          />
          <h1 className="mt-5 text-xl font-semibold">
            {t("admin.preview.jobsUnavailableTitle")}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t("admin.preview.jobsUnavailableDescription", {
              name: displayName,
            })}
          </p>
          <Button
            className="mt-6"
            variant="outline"
            render={<Link href="/admin" />}
          >
            <ArrowLeft aria-hidden="true" />
            {t("admin.preview.exit")}
          </Button>
        </section>
      </div>
    </>
  );
}

function AdminJobsPreview({
  userId,
  initialView,
}: {
  userId: Id<"users">;
  initialView: JobView;
}) {
  const { t } = useTranslation();
  const navigation = useJobViewNavigation(initialView);
  const preview = useQuery(api.admin.getUserJobsPreview, {
    userId,
    view: navigation.view,
  });
  const jobsPath = `/admin/users/${userId}/jobs`;

  if (preview === null) return <MissingUser />;

  if (preview === undefined) {
    return (
      <>
        <PreviewToolbar displayName={t("admin.preview.loadingUser")} />
        <AuthenticatedShell
          currentPage="jobs"
          jobView={navigation.view}
          onJobViewChange={navigation.selectView}
          jobsPath={jobsPath}
          readOnly
        >
          <DashboardLoadingScreen view={navigation.view} />
        </AuthenticatedShell>
      </>
    );
  }

  const displayName =
    preview.profile.profile?.preferredDisplayName ||
    preview.profile.identity.googleDisplayName ||
    preview.profile.identity.email ||
    t("admin.preview.unknownUser");

  if (
    !preview.profile.profile?.onboardingCompleted ||
    preview.profile.profile.cvReviewPending
  ) {
    return <JobsUnavailable displayName={displayName} />;
  }

  return (
    <ProfileProvider data={preview.profile}>
      <PreviewToolbar displayName={displayName} />
      <AuthenticatedShell
        data={preview.profile}
        currentPage="jobs"
        jobView={navigation.view}
        onJobViewChange={navigation.selectView}
        jobsPath={jobsPath}
        readOnly
      >
        <DashboardScreen
          view={navigation.view}
          data={{
            result: preview.feed,
            emailPreference: preview.emailPreference,
          }}
          readOnly
        />
      </AuthenticatedShell>
    </ProfileProvider>
  );
}

export function AdminJobsPreviewRoute({
  userId,
  initialView,
}: {
  userId: Id<"users">;
  initialView: JobView;
}) {
  return (
    <AuthBoundary unauthenticated={<SignInScreen />}>
      <AdminJobsPreview userId={userId} initialView={initialView} />
    </AuthBoundary>
  );
}

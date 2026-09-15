"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useTranslation } from "react-i18next";
import { Brand } from "@/features/auth/brand";
import { UserMenu } from "@/features/auth/user-menu";
import { PageContainer } from "@/components/ui/product-layout";
import { cn } from "@/lib/utils";
import type { CurrentProfile } from "@/features/profile/profile-types";

export function AuthenticatedShell({
  data,
  children,
  currentPage,
  jobView,
}: {
  data?: CurrentProfile;
  children: ReactNode;
  currentPage: "jobs" | "profile";
  jobView?: "suggestions" | "inProgress";
}) {
  const { t, i18n } = useTranslation();
  const displayName = data
    ? data.profile?.preferredDisplayName ||
      data.identity.googleDisplayName ||
      t("dashboard.nav.profile")
    : null;
  const isJobsPage = currentPage === "jobs";
  const isSaved = isJobsPage && jobView === "inProgress";

  const jobLink = (to: string, label: string, active: boolean) => (
    <Link
      href={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "min-h-9 rounded-lg px-2.5 py-2 text-xs font-semibold transition-[color,background-color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-white/35 motion-reduce:transition-none sm:px-4 sm:text-sm",
        active
          ? "text-brand-midnight bg-white shadow-sm"
          : "text-white/65 hover:bg-white/10 hover:text-white",
      )}
    >
      {label}
    </Link>
  );

  return (
    <DirectionProvider direction={i18n.dir()}>
      <div className="app-shell-surface flex min-h-svh flex-col text-start">
        <header className="bg-brand-midnight sticky top-0 z-30 border-b border-white/8 text-white shadow-lg shadow-slate-950/8">
          <PageContainer className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-2 sm:min-h-17 sm:grid-cols-[1fr_auto_1fr]">
            <Link
              href="/"
              className="justify-self-start"
              aria-label={t("brand.name")}
            >
              <Brand inverse />
            </Link>

            <nav
              className="flex items-center gap-0.5 justify-self-center"
              aria-label={t("dashboard.jobNavigation")}
            >
              {jobLink(
                "/",
                t("applications.suggestions"),
                isJobsPage && !isSaved,
              )}
              {jobLink(
                "/?tab=in-progress",
                t("applications.inProgress"),
                isSaved,
              )}
            </nav>

            {data && displayName ? (
              <UserMenu
                identity={data.identity}
                displayName={displayName}
                tone="dark"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex min-h-11 items-center gap-2 justify-self-end px-1.5"
              >
                <span className="size-8 rounded-full bg-white/16 motion-safe:animate-pulse" />
                <span className="hidden h-3 w-20 rounded-full bg-white/12 motion-safe:animate-pulse md:block" />
              </div>
            )}
          </PageContainer>
        </header>
        <main className="flex-1 py-6 sm:py-10">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </DirectionProvider>
  );
}

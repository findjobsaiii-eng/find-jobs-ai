"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Bookmark, Sparkles, type LucideIcon } from "lucide-react";
import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
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
  onJobViewChange,
  jobsPath = "/",
  readOnly = false,
}: {
  data?: CurrentProfile;
  children: ReactNode;
  currentPage: "jobs" | "profile";
  jobView?: "suggestions" | "inProgress";
  onJobViewChange?: (view: "suggestions" | "inProgress") => void;
  jobsPath?: string;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const displayName = data
    ? data.profile?.preferredDisplayName ||
      data.identity.googleDisplayName ||
      t("dashboard.nav.profile")
    : null;
  const isJobsPage = currentPage === "jobs";
  const isSaved = isJobsPage && jobView === "inProgress";

  const jobLink = (
    to: string,
    label: string,
    view: "suggestions" | "inProgress",
    active: boolean,
    Icon: LucideIcon,
  ) => (
    <Link
      href={to}
      aria-current={active ? "page" : undefined}
      onClick={
        onJobViewChange
          ? (event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onJobViewChange(view);
            }
          : undefined
      }
      className={cn(
        "relative isolate inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-white/35 motion-reduce:transition-none sm:px-4 sm:text-sm",
        active
          ? "text-brand-midnight"
          : "text-white/65 hover:bg-white/10 hover:text-white",
      )}
    >
      {active ? (
        <m.span
          data-job-tab-indicator=""
          aria-hidden="true"
          layoutId="active-job-view"
          className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm"
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 520, damping: 42, mass: 0.72 }
          }
        />
      ) : null}
      <Icon aria-hidden="true" className="size-3.5 sm:size-4" />
      <span>{label}</span>
    </Link>
  );

  return (
    <DirectionProvider direction={i18n.dir()}>
      <div className="app-shell-surface flex min-h-svh flex-col text-start">
        <header className="bg-brand-midnight sticky top-0 z-30 border-b border-white/8 text-white shadow-lg shadow-slate-950/8">
          <PageContainer className="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-2 sm:min-h-17 sm:grid-cols-[1fr_auto_1fr]">
            <Link
              href={jobsPath}
              className="justify-self-start"
              aria-label={t("brand.name")}
            >
              <Brand inverse />
            </Link>

            <nav
              className="flex items-center gap-0.5 justify-self-center rounded-xl border border-white/8 bg-white/5 p-1"
              aria-label={t("dashboard.jobNavigation")}
            >
              <LazyMotion features={domAnimation}>
                {jobLink(
                  jobsPath,
                  t("applications.suggestions"),
                  "suggestions",
                  isJobsPage && !isSaved,
                  Sparkles,
                )}
                {jobLink(
                  `${jobsPath}?tab=in-progress`,
                  t("applications.inProgress"),
                  "inProgress",
                  isSaved,
                  Bookmark,
                )}
              </LazyMotion>
            </nav>

            {data && displayName ? (
              <UserMenu
                identity={data.identity}
                displayName={displayName}
                tone="dark"
                readOnly={readOnly}
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
        <main id="main-content" tabIndex={-1} className="flex-1 py-6 sm:py-10">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </DirectionProvider>
  );
}

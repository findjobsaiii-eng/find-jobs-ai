"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ChevronDown,
  Languages,
  LoaderCircle,
  LogOut,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/features/auth/brand";
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
  const { signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const signingOutRef = useRef(false);
  const displayName = data
    ? data.profile?.preferredDisplayName ||
      data.identity.googleDisplayName ||
      t("dashboard.nav.profile")
    : null;
  const initials = displayName?.trim().slice(0, 1).toLocaleUpperCase();
  const isJobsPage = currentPage === "jobs";
  const isSaved = isJobsPage && jobView === "inProgress";

  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };

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
      <div className="app-shell-surface min-h-svh text-start">
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
              <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <Popover.Trigger
                  aria-label={t("dashboard.userMenu")}
                  className="flex min-h-11 min-w-11 items-center justify-self-end rounded-xl p-1.5 transition-colors outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/35"
                >
                  <span className="bg-brand-teal grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold text-white">
                    {data.identity.profileImage ? (
                      <Image
                        src={data.identity.profileImage}
                        alt=""
                        width={32}
                        height={32}
                        className="size-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <span className="mx-2 hidden max-w-32 truncate text-sm font-medium md:inline">
                    {displayName}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="hidden size-4 text-white/55 md:block"
                  />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-50"
                  >
                    <Popover.Popup className="bg-popover text-popover-foreground border-border w-60 origin-[var(--transform-origin)] rounded-xl border p-2 text-start shadow-xl transition-[transform,opacity] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
                      <div className="border-border mb-1 border-b px-3 py-2.5">
                        <p className="truncate text-sm font-semibold">
                          {displayName}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {data.identity.email}
                        </p>
                      </div>
                      <Link
                        href="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-3"
                      >
                        <UserRound aria-hidden="true" className="size-4" />
                        {t("dashboard.nav.profile")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void i18n.changeLanguage(
                            i18n.resolvedLanguage === "he" ? "en" : "he",
                          );
                        }}
                        className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-3"
                      >
                        <Languages aria-hidden="true" className="size-4" />
                        {t("language.otherLanguage")}
                      </button>
                      <button
                        type="button"
                        disabled={signingOut}
                        onClick={() => {
                          setMenuOpen(false);
                          void handleSignOut();
                        }}
                        className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring/40 mt-1 flex min-h-10 w-full items-center gap-2.5 rounded-lg border-t px-3 text-sm outline-none focus-visible:ring-3 disabled:opacity-60"
                      >
                        {signingOut ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <LogOut aria-hidden="true" className="size-4" />
                        )}
                        {t("auth.signOut")}
                      </button>
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
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
          {signOutError ? (
            <PageContainer>
              <p role="alert" className="text-destructive pb-2 text-sm">
                {t("auth.signOutError")}
              </p>
            </PageContainer>
          ) : null}
        </header>
        <main className="relative py-6 sm:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(circle_at_top,var(--color-brand-glow),transparent_72%)] opacity-70"
          />
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </DirectionProvider>
  );
}

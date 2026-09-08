import { useRef, useState, type ReactNode } from "react";
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
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Brand } from "@/features/auth/brand";
import { PageContainer } from "@/components/ui/product-layout";
import { cn } from "@/lib/utils";
import type { CurrentProfile } from "@/features/profile/profile-types";

export function AuthenticatedShell({
  data,
  children,
}: {
  data: CurrentProfile;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuthActions();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const signingOutRef = useRef(false);
  const displayName =
    data.profile?.preferredDisplayName ||
    data.identity.googleDisplayName ||
    t("dashboard.nav.profile");
  const initials = displayName.trim().slice(0, 1).toLocaleUpperCase();
  const isJobsPage = location.pathname === "/";
  const isSaved = isJobsPage && location.search.includes("tab=in-progress");

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
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/40 min-h-9 rounded-lg px-3 py-2 text-sm font-medium transition-[color,background-color,box-shadow] outline-none focus-visible:ring-3 motion-reduce:transition-none sm:px-4",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <DirectionProvider direction={i18n.dir()}>
      <div className="bg-muted/30 min-h-svh text-start">
        <header className="bg-background/95 border-border sticky top-0 z-30 border-b backdrop-blur">
          <PageContainer className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Link
              to="/"
              className="justify-self-start"
              aria-label={t("brand.name")}
            >
              <span className="[&_div>span:last-child]:hidden sm:[&_div>span:last-child]:inline">
                <Brand />
              </span>
            </Link>

            <nav
              className="flex items-center gap-0.5"
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

            <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Popover.Trigger
                aria-label={t("dashboard.userMenu")}
                className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-11 min-w-11 items-center justify-self-end rounded-xl p-1.5 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold">
                  {data.identity.profileImage ? (
                    <img
                      src={data.identity.profileImage}
                      alt=""
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
                  className="text-muted-foreground hidden size-4 md:block"
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
                      to={`/profile${location.search}`}
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
          </PageContainer>
          {signOutError ? (
            <PageContainer>
              <p role="alert" className="text-destructive pb-2 text-sm">
                {t("auth.signOutError")}
              </p>
            </PageContainer>
          ) : null}
        </header>
        <main className="py-7 sm:py-10">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </DirectionProvider>
  );
}

import { useRef, useState, type ReactNode } from "react";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Link, useLocation } from "react-router";
import { LoaderCircle, LogOut } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/features/auth/brand";
import { LanguageButton } from "@/features/auth/language-button";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/product-layout";
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
  const signingOutRef = useRef(false);
  const displayName =
    data.profile?.preferredDisplayName ||
    data.identity.googleDisplayName ||
    t("dashboard.nav.profile");
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
  const navLink = (to: string, label: string, active: boolean) => (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "bg-primary/10 text-primary rounded-lg px-3 py-2 text-sm font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      }
    >
      {label}
    </Link>
  );
  return (
    <DirectionProvider direction={i18n.dir()}>
      <div className="bg-muted/30 min-h-svh text-start">
        <header className="bg-background/95 border-border sticky top-0 z-20 border-b backdrop-blur">
          <PageContainer className="flex min-h-16 items-center gap-1.5 sm:gap-4">
            <Link to="/" className="shrink-0" aria-label={t("brand.name")}>
              <span className="[&_div>span:last-child]:hidden sm:[&_div>span:last-child]:inline">
                <Brand />
              </span>
            </Link>
            <nav
              className="ms-auto flex items-center gap-1"
              aria-label={t("dashboard.navigation")}
            >
              {navLink("/", t("dashboard.nav.jobs"), location.pathname === "/")}
              {navLink(
                `/profile${location.search}`,
                t("dashboard.nav.profile"),
                location.pathname.startsWith("/profile") ||
                  location.pathname === "/resume",
              )}
            </nav>
            <LanguageButton compactOnMobile />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-32 truncate text-sm font-medium">
                {displayName}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("auth.signOut")}
                disabled={signingOut}
                onClick={() => void handleSignOut()}
              >
                {signingOut ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <LogOut aria-hidden="true" />
                )}
              </Button>
            </div>
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

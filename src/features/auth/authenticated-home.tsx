import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LoaderCircle, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./auth-shell";

export function AuthenticatedHome() {
  const { t } = useTranslation();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
  };

  return (
    <AuthShell>
      <section className="max-w-xl text-center" aria-labelledby="welcome-title">
        <span
          aria-hidden="true"
          className="bg-primary/10 text-primary mx-auto mb-6 grid size-12 place-items-center rounded-2xl text-xl"
        >
          ✓
        </span>
        <h1
          id="welcome-title"
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {t("auth.welcomeTitle")}
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md leading-7">
          {t("auth.welcomeDescription")}
        </p>
        <Button
          variant="ghost"
          className="mt-8"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <LogOut aria-hidden="true" />
          )}
          {t("auth.signOut")}
        </Button>
      </section>
    </AuthShell>
  );
}

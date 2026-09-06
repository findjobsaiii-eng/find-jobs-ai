import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./auth-shell";
import { GoogleMark } from "./google-mark";
import {
  clearOAuthAttemptPending,
  markOAuthAttemptPending,
} from "./oauth-callback";

export function SignInScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setIsSubmitting(true);
    setError(null);
    markOAuthAttemptPending(window.sessionStorage);

    try {
      await signIn("google", { redirectTo: window.location.origin });
    } catch {
      clearOAuthAttemptPending(window.sessionStorage);
      setError(t("auth.error"));
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <section
        aria-labelledby="sign-in-title"
        className="bg-card/90 w-full max-w-md rounded-3xl border p-6 shadow-[0_24px_80px_-32px_oklch(0.25_0.04_165_/_0.28)] backdrop-blur-sm sm:p-8"
      >
        <div className="mb-8">
          <p className="text-primary mb-3 text-sm font-medium">
            {t("auth.eyebrow")}
          </p>
          <h1
            id="sign-in-title"
            className="text-3xl font-semibold tracking-tight"
          >
            {t("auth.title")}
          </h1>
          <p className="text-muted-foreground mt-3 leading-7">
            {t("auth.description")}
          </p>
        </div>

        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full bg-white text-slate-900 shadow-xs hover:bg-slate-50"
          onClick={() => void signInWithGoogle()}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <GoogleMark />
          )}
          {isSubmitting ? t("auth.connecting") : t("auth.continueWithGoogle")}
        </Button>

        <div aria-live="polite" className="min-h-6 pt-3 text-center text-sm">
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
      </section>
    </AuthShell>
  );
}

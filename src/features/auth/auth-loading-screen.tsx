import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "./auth-shell";

export function AuthLoadingScreen({
  variant,
}: {
  variant: "session" | "callback" | "profile";
}) {
  const { t } = useTranslation();

  return (
    <AuthShell>
      <div
        className="text-muted-foreground flex items-center gap-3 text-sm"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        {t(
          variant === "callback"
            ? "auth.completingSignIn"
            : variant === "profile"
              ? "onboarding.loadingProfile"
              : "auth.checkingSession",
        )}
      </div>
    </AuthShell>
  );
}

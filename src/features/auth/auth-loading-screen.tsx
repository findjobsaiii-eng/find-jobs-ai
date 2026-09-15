import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { JobmiterMark } from "@/components/ui/jobmiter-logo";
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
        className="text-muted-foreground flex flex-col items-center gap-4 text-sm"
        role="status"
      >
        <span className="relative grid size-20 place-items-center">
          <span
            aria-hidden="true"
            className="border-brand-electric/20 absolute inset-0 rounded-full border motion-safe:animate-pulse"
          />
          <JobmiterMark className="size-12" />
        </span>
        <span className="flex items-center gap-2">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {t(
            variant === "callback"
              ? "auth.completingSignIn"
              : variant === "profile"
                ? "onboarding.loadingProfile"
                : "auth.checkingSession",
          )}
        </span>
      </div>
    </AuthShell>
  );
}

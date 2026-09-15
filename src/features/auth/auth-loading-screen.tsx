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
    <AuthShell chrome={false}>
      <div
        className="text-muted-foreground flex flex-col items-center gap-5 text-sm"
        role="status"
      >
        <span className="bg-brand-midnight relative grid size-22 place-items-center rounded-[1.65rem] shadow-xl shadow-slate-950/16">
          <span
            aria-hidden="true"
            className="border-brand-electric/30 absolute -inset-2 rounded-[2rem] border motion-safe:animate-pulse"
          />
          <JobmiterMark className="size-13" />
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

import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./auth-shell";

export function AuthCallbackErrorScreen({
  onTryAgain,
}: {
  onTryAgain: () => void;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell>
      <section
        aria-labelledby="auth-error-title"
        className="max-w-md text-center"
      >
        <CircleAlert
          aria-hidden="true"
          className="text-destructive mx-auto mb-5 size-10"
        />
        <h1
          id="auth-error-title"
          className="text-3xl font-semibold tracking-tight text-balance"
        >
          {t("auth.callbackErrorTitle")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7 text-pretty">
          {t("auth.callbackErrorDescription")}
        </p>
        <Button className="mt-7" onClick={onTryAgain}>
          {t("auth.tryAgain")}
        </Button>
      </section>
    </AuthShell>
  );
}

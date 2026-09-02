import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "./auth-shell";

export function AuthLoadingScreen() {
  const { t } = useTranslation();

  return (
    <AuthShell>
      <div
        className="text-muted-foreground flex items-center gap-3 text-sm"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        {t("auth.checkingSession")}
      </div>
    </AuthShell>
  );
}

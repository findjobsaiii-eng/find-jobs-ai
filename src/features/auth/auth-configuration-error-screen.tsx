import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "./auth-shell";

export function AuthConfigurationErrorScreen() {
  const { t } = useTranslation();

  return (
    <AuthShell>
      <section
        aria-labelledby="configuration-error-title"
        className="max-w-md text-center"
      >
        <CircleAlert
          aria-hidden="true"
          className="text-destructive mx-auto mb-5 size-10"
        />
        <h1
          id="configuration-error-title"
          className="text-3xl font-semibold tracking-tight"
        >
          {t("auth.configurationErrorTitle")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          {t("auth.configurationErrorDescription")}
        </p>
      </section>
    </AuthShell>
  );
}

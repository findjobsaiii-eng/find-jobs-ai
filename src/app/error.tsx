"use client";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AuthShell>
      <section className="max-w-md text-center" aria-labelledby="error-title">
        <h1
          id="error-title"
          className="text-3xl font-semibold tracking-tight text-balance"
        >
          {t("errors.title")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7 text-pretty">
          {t("errors.description")}
        </p>
        <Button className="mt-6" onClick={reset}>
          {t("errors.retry")}
        </Button>
      </section>
    </AuthShell>
  );
}

"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <AuthShell>
      <section
        className="max-w-md text-center"
        aria-labelledby="not-found-title"
      >
        <p className="text-brand-electric text-sm font-semibold">404</p>
        <h1
          id="not-found-title"
          className="mt-2 text-3xl font-semibold tracking-tight text-balance"
        >
          {t("errors.notFoundTitle")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7 text-pretty">
          {t("errors.notFoundDescription")}
        </p>
        <Button
          className="mt-6"
          nativeButton={false}
          render={<Link href="/" />}
        >
          {t("errors.backHome")}
        </Button>
      </section>
    </AuthShell>
  );
}

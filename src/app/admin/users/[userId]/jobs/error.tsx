"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function AdminJobsPreviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-brand-snow grid min-h-svh place-items-center p-6">
      <section
        className="bg-card border-border max-w-md rounded-3xl border p-8 text-center shadow-lg"
        aria-labelledby="admin-preview-error-title"
      >
        <AlertCircle
          aria-hidden="true"
          className="text-destructive mx-auto size-10"
        />
        <h1
          id="admin-preview-error-title"
          className="mt-5 text-xl font-semibold"
        >
          {t("admin.preview.loadErrorTitle")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {t("admin.preview.loadErrorDescription")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw aria-hidden="true" />
            {t("admin.preview.retry")}
          </Button>
          <Button variant="outline" render={<Link href="/admin" />}>
            <ArrowLeft aria-hidden="true" />
            {t("admin.preview.exit")}
          </Button>
        </div>
      </section>
    </div>
  );
}

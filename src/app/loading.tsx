"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@/features/auth/auth-shell";

export default function Loading() {
  const { t } = useTranslation();
  return (
    <AuthShell>
      <div
        role="status"
        className="text-muted-foreground flex items-center gap-3 text-sm"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin motion-reduce:animate-none"
        />
        {t("errors.loading")}
      </div>
    </AuthShell>
  );
}

"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

export function PrivacyNotice() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";
  return (
    <p className="text-muted-foreground text-sm leading-6">
      <Link
        className="text-primary underline underline-offset-4"
        href={`/${language}/terms`}
      >
        {t("siteFooter.terms")}
      </Link>
      {" · "}
      <Link
        className="text-primary underline underline-offset-4"
        href={`/${language}/privacy`}
      >
        {t("siteFooter.privacy")}
      </Link>
    </p>
  );
}

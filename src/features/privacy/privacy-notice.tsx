"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

export function PrivacyNotice({ context }: { context: "signIn" | "upload" }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";
  return (
    <p className="text-muted-foreground text-sm leading-6">
      {t(`privacyNotice.${context}`)}{" "}
      <Link
        className="text-primary underline underline-offset-4"
        href={`/${language}/privacy`}
      >
        {t("siteFooter.privacy")}
      </Link>
      {" · "}
      <Link
        className="text-primary underline underline-offset-4"
        href={`/${language}/terms`}
      >
        {t("siteFooter.terms")}
      </Link>
    </p>
  );
}

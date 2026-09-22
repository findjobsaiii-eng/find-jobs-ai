"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useCookiePreferences } from "./cookie-consent-context";

const pages = ["terms", "privacy", "cookies", "accessibility"] as const;

export function SiteFooter() {
  const { t, i18n } = useTranslation();
  const openPreferences = useCookiePreferences();
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";

  return (
    <footer className="border-border bg-background text-muted-foreground border-t px-5 py-6 text-sm">
      <nav
        aria-label={t("siteFooter.navigation")}
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3"
      >
        {pages.map((page) => (
          <Link
            key={page}
            href={`/${language}/${page}`}
            className="hover:text-foreground underline-offset-4 focus-visible:underline"
          >
            {t(`siteFooter.${page}`)}
          </Link>
        ))}
        <Link
          href={`/${language}/contact`}
          className="hover:text-foreground underline-offset-4 focus-visible:underline"
        >
          {t("siteFooter.contact")}
        </Link>
        <button
          type="button"
          onClick={openPreferences}
          className="hover:text-foreground cursor-pointer underline-offset-4 focus-visible:underline"
        >
          {t("siteFooter.preferences")}
        </button>
      </nav>
    </footer>
  );
}

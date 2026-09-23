"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { syncAnalyticsConsent } from "./analytics";
import {
  readCookieConsent,
  saveCookieConsent,
  type CookieConsent,
} from "./cookie-consent";
import { SiteFooter } from "./site-footer";
import { CookiePreferencesContext } from "./cookie-consent-context";

export function CookieConsentManager({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";

  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      const current = readCookieConsent();
      setConsent(current);
      setReady(true);
    }, 0);

    const syncFromStorage = () => {
      const updated = readCookieConsent();
      setConsent(updated);
      void syncAnalyticsConsent(updated?.analytics ?? false);
    };
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const openPreferences = useCallback(() => {
    setStorageError(false);
    setPreferencesOpen(true);
  }, []);

  const choose = (analytics: boolean) => {
    const saved = saveCookieConsent(analytics);
    if (!saved) {
      setStorageError(true);
      return;
    }
    setConsent(saved);
    setPreferencesOpen(false);
    setStorageError(false);
    void syncAnalyticsConsent(analytics);
  };

  return (
    <CookiePreferencesContext.Provider value={openPreferences}>
      {children}
      <SiteFooter />
      {ready && (!consent || preferencesOpen) ? (
        <section
          aria-label={t("cookieConsent.title")}
          className="bg-card text-foreground border-border fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl rounded-2xl border p-3 shadow-xl sm:p-4"
        >
          <p className="text-sm leading-6">
            {t("cookieConsent.description")}{" "}
            <Link
              href={`/${language}/cookies`}
              className="text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t("cookieConsent.policy")}
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => choose(true)}>
              {t("cookieConsent.acceptAll")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => choose(false)}>
              {t("cookieConsent.rejectOptional")}
            </Button>
          </div>
          {storageError ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {t("cookieConsent.storageError")}
            </p>
          ) : null}
        </section>
      ) : null}
    </CookiePreferencesContext.Provider>
  );
}

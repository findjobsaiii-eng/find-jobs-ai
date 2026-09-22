"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [analyticsSelected, setAnalyticsSelected] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";

  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      const current = readCookieConsent();
      setConsent(current);
      setAnalyticsSelected(current?.analytics ?? false);
      setReady(true);
    }, 0);

    const syncFromStorage = () => {
      const updated = readCookieConsent();
      setConsent(updated);
      setAnalyticsSelected(updated?.analytics ?? false);
      void syncAnalyticsConsent(updated?.analytics ?? false);
    };
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const openPreferences = useCallback(() => {
    setAnalyticsSelected(readCookieConsent()?.analytics ?? false);
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
    setAnalyticsSelected(analytics);
    setPreferencesOpen(false);
    setStorageError(false);
    void syncAnalyticsConsent(analytics);
  };

  return (
    <CookiePreferencesContext.Provider value={openPreferences}>
      {children}
      <SiteFooter />
      {ready && !consent ? (
        <section
          aria-label={t("cookieConsent.title")}
          className="bg-card text-foreground border-border fixed inset-x-4 bottom-4 z-40 mx-auto max-w-3xl rounded-2xl border p-4 shadow-2xl sm:p-5"
        >
          <h2 className="text-base font-semibold">
            {t("cookieConsent.title")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t("cookieConsent.description")}{" "}
            <Link
              href={`/${language}/cookies`}
              className="text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t("cookieConsent.policy")}
            </Link>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => choose(true)}>
              {t("cookieConsent.acceptAll")}
            </Button>
            <Button variant="outline" onClick={() => choose(false)}>
              {t("cookieConsent.rejectOptional")}
            </Button>
            <Button variant="ghost" onClick={openPreferences}>
              {t("cookieConsent.manage")}
            </Button>
          </div>
          {storageError ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {t("cookieConsent.storageError")}
            </p>
          ) : null}
        </section>
      ) : null}
      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent>
          <DialogTitle>{t("cookieConsent.manage")}</DialogTitle>
          <DialogDescription>
            {t("cookieConsent.preferencesDescription")}
          </DialogDescription>
          <div className="border-border mt-5 space-y-4 border-y py-4">
            <div>
              <p className="font-medium">{t("cookieConsent.necessary")}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("cookieConsent.necessaryDescription")}
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={analyticsSelected}
                onChange={(event) => setAnalyticsSelected(event.target.checked)}
                className="accent-primary mt-1 size-4"
              />
              <span>
                <span className="block font-medium">
                  {t("cookieConsent.analytics")}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {t("cookieConsent.analyticsDescription")}
                </span>
              </span>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => choose(analyticsSelected)}>
              {t("cookieConsent.save")}
            </Button>
            <Button variant="outline" onClick={() => choose(false)}>
              {t("cookieConsent.rejectOptional")}
            </Button>
          </div>
          {storageError ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {t("cookieConsent.storageError")}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </CookiePreferencesContext.Provider>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import { legalVersion } from "@/i18n/locales/legal";

export function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const consent = useQuery(api.legalConsents.getCurrent, {});
  const accept = useMutation(api.legalConsents.acceptCurrent);
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";

  if (consent === undefined) {
    return (
      <AuthShell>
        <p role="status">{t("legalAcceptance.loading")}</p>
      </AuthShell>
    );
  }
  if (
    consent?.termsVersion === legalVersion &&
    consent.privacyVersion === legalVersion
  ) {
    return <>{children}</>;
  }

  const submit = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await accept({
        termsVersion: legalVersion,
        privacyVersion: legalVersion,
        marketingOptIn: marketing,
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell>
      <section
        aria-labelledby="legal-consent-title"
        className="bg-card w-full max-w-lg rounded-3xl border p-6 shadow-lg sm:p-8"
      >
        <h1 id="legal-consent-title" className="text-2xl font-semibold">
          {t("legalAcceptance.title")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          {t("legalAcceptance.description")}
        </p>
        <p className="mt-4 text-sm leading-6">
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
        <label className="mt-6 flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="accent-primary mt-1 size-4 shrink-0"
          />
          <span>{t("legalAcceptance.required")}</span>
        </label>
        <label className="mt-4 flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(event) => setMarketing(event.target.checked)}
            className="accent-primary mt-1 size-4 shrink-0"
          />
          <span>{t("legalAcceptance.marketing")}</span>
        </label>
        <Button
          className="mt-7"
          disabled={!accepted || saving}
          onClick={() => void submit()}
        >
          {t("legalAcceptance.continue")}
        </Button>
        {failed ? (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {t("legalAcceptance.error")}
          </p>
        ) : null}
      </section>
    </AuthShell>
  );
}

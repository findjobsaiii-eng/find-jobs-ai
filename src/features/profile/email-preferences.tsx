"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { SectionHeader, Surface } from "@/components/ui/product-layout";
import { cn } from "@/lib/utils";

const FREQUENCIES = ["daily", "weekly", "never"] as const;
type Frequency = (typeof FREQUENCIES)[number];

export function EmailPreferences() {
  const { t } = useTranslation();
  const preference = useQuery(api.emailPreferences.getMine);
  const updateFrequency = useMutation(api.emailPreferences.updateFrequency);
  const [pending, setPending] = useState<Frequency | null>(null);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const selected = pending ?? preference?.frequency;

  async function selectFrequency(frequency: Frequency) {
    setPending(frequency);
    setError(false);
    setSaved(false);
    try {
      await updateFrequency({ frequency });
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <Surface>
      <SectionHeader
        title={t("emailPreferences.title")}
        description={t("emailPreferences.description")}
      />
      <fieldset disabled={preference === undefined || pending !== null}>
        <legend className="sr-only">{t("emailPreferences.frequency")}</legend>
        <div className="grid gap-3">
          {FREQUENCIES.map((frequency) => (
            <label
              key={frequency}
              className={cn(
                "border-border hover:border-primary/40 focus-within:ring-ring/40 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-3",
                selected === frequency && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="email-frequency"
                value={frequency}
                checked={selected === frequency}
                onChange={() => void selectFrequency(frequency)}
                className="accent-primary mt-1 size-4 shrink-0"
              />
              <span>
                <span className="flex items-center gap-2 font-medium">
                  <Mail aria-hidden="true" className="size-4" />
                  {t(`emailPreferences.options.${frequency}.label`)}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm leading-6">
                  {t(`emailPreferences.options.${frequency}.description`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite" className="mt-3 min-h-5 text-sm">
        {saved ? (
          <p className="text-primary">{t("emailPreferences.saved")}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {t("emailPreferences.error")}
          </p>
        ) : null}
      </div>
    </Surface>
  );
}

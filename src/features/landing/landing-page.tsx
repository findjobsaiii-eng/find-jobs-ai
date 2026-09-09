"use client";

import {
  BriefcaseBusiness,
  Check,
  FileText,
  LoaderCircle,
  Sparkles,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Brand } from "@/features/auth/brand";
import { GoogleMark } from "@/features/auth/google-mark";
import { LanguageButton } from "@/features/auth/language-button";
import { useGoogleSignIn } from "@/features/auth/use-google-sign-in";

const STEPS = [
  { id: "upload", icon: FileText },
  { id: "profile", icon: UserRound },
  { id: "jobs", icon: BriefcaseBusiness },
] as const;

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const { error, isSubmitting, signInWithGoogle } = useGoogleSignIn();

  return (
    <main
      className="bg-background relative isolate min-h-svh overflow-hidden"
      dir={i18n.dir()}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[46rem] max-w-7xl bg-[radial-gradient(circle_at_top,var(--color-brand-glow),transparent_66%)]"
      />
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <header className="flex min-h-20 items-center justify-between">
          <Brand />
          <LanguageButton />
        </header>

        <section className="grid items-center gap-14 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-primary mb-5 flex items-center gap-2 text-sm font-medium">
              <Sparkles aria-hidden="true" className="size-4" />
              {t("landing.eyebrow")}
            </p>
            <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl">
              {t("landing.title")}
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8 text-pretty">
              {t("landing.description")}
            </p>
            <div className="mt-8 max-w-sm">
              <Button
                size="lg"
                className="h-12 w-full rounded-xl text-base shadow-lg shadow-emerald-900/10"
                disabled={isSubmitting}
                onClick={() => void signInWithGoogle()}
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-5 animate-spin"
                  />
                ) : (
                  <GoogleMark />
                )}
                {isSubmitting ? t("auth.connecting") : t("landing.signIn")}
              </Button>
              <p className="text-muted-foreground mt-3 text-center text-xs">
                {t("landing.privacy")}
              </p>
              <div aria-live="polite" className="min-h-6 pt-2 text-sm">
                {error ? (
                  <p className="text-destructive text-center">{error}</p>
                ) : null}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              delay: 0.08,
              duration: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative mx-auto w-full max-w-xl"
          >
            <div className="bg-card/90 border-border rounded-3xl border p-4 shadow-[0_30px_90px_-42px_oklch(0.25_0.07_165_/_0.45)] backdrop-blur sm:p-6">
              <div className="flex items-center gap-2 pb-5">
                {["resume", "profile", "matches"].map((item) => (
                  <span
                    key={item}
                    className="bg-primary/10 text-primary flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium"
                  >
                    <Check aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {t(`landing.preview.${item}`)}
                    </span>
                  </span>
                ))}
              </div>
              <div className="bg-muted/55 rounded-2xl p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl">
                    <BriefcaseBusiness aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">
                      {t("landing.preview.role")}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t("landing.preview.company")}
                    </p>
                  </div>
                  <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">
                    {t("landing.preview.match")}
                  </span>
                </div>
                <div className="mt-5 space-y-2">
                  <div className="bg-background h-2.5 w-full rounded-full" />
                  <div className="bg-background h-2.5 w-5/6 rounded-full" />
                  <div className="bg-background h-2.5 w-3/5 rounded-full" />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["React", "TypeScript", "Next.js"].map((skill) => (
                    <span
                      key={skill}
                      className="bg-background border-border rounded-full border px-2.5 py-1 text-xs"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-border border-t py-14 sm:py-18">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("landing.howItWorks")}
          </h2>
          <ol className="mt-7 grid gap-3 md:grid-cols-3">
            {STEPS.map(({ id, icon: Icon }, index) => (
              <li
                key={id}
                className="bg-card border-border rounded-2xl border p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold">
                  {t(`landing.steps.${id}.title`)}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {t(`landing.steps.${id}.description`)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

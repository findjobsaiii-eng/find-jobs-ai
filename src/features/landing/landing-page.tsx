"use client";

import {
  ArrowRight,
  Check,
  FileCheck2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { JobmiterMark } from "@/components/ui/jobmiter-logo";
import { Brand } from "@/features/auth/brand";
import { GoogleMark } from "@/features/auth/google-mark";
import { LanguageButton } from "@/features/auth/language-button";
import { useGoogleSignIn } from "@/features/auth/use-google-sign-in";
import { PrivacyNotice } from "@/features/privacy/privacy-notice";
import { AnimatedMatchingMap } from "./animated-matching-map";

const STEPS = [
  { id: "ask", icon: Search },
  { id: "match", icon: Sparkles },
  { id: "apply", icon: FileCheck2 },
] as const;

const PILLARS = [
  { id: "clarity", icon: Search },
  { id: "speed", icon: Zap },
  { id: "relevance", icon: Target },
  { id: "trust", icon: ShieldCheck },
] as const;

const PREVIEW_JOBS = [
  { id: "product", score: 94 },
  { id: "frontend", score: 89 },
  { id: "design", score: 86 },
] as const;

function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div initial={false} className={className}>
      {children}
    </motion.div>
  );
}

function TrustPoints() {
  const { t } = useTranslation();
  return (
    <div className="mt-6 space-y-3 text-sm font-medium text-slate-700">
      {["focused", "transparent", "progress"].map((id) => (
        <span key={id} className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700">
            <Check aria-hidden="true" className="size-3" />
          </span>
          {t(`landing.product.points.${id}`)}
        </span>
      ))}
    </div>
  );
}

function WorkspacePreview() {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white shadow-[var(--brand-shadow-preview)]">
      <div className="bg-brand-midnight flex min-h-16 items-center justify-between px-4 text-white sm:px-6">
        <Brand inverse />
        <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/8 p-1 text-xs font-medium sm:flex">
          <span className="rounded-lg bg-white px-3 py-1.5 text-slate-900">
            {t("landing.preview.navMatches")}
          </span>
          <span className="px-3 py-1.5 text-white/70">
            {t("landing.preview.navProgress")}
          </span>
        </div>
        <span className="bg-brand-teal grid size-8 place-items-center rounded-full text-xs font-bold text-white">
          JD
        </span>
      </div>
      <div className="landing-app-surface p-4 sm:p-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-brand-electric text-[0.68rem] font-bold tracking-[0.18em] uppercase">
              {t("landing.preview.eyebrow")}
            </p>
            <h3 className="text-brand-midnight mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
              {t("landing.preview.title")}
            </h3>
          </div>
          <span className="hidden rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 sm:block">
            {t("landing.preview.fresh")}
          </span>
        </div>
        <div className="space-y-2.5">
          {PREVIEW_JOBS.map(({ id, score }, index) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                  index === 1
                    ? "bg-teal-50 text-teal-600"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                {t(`landing.preview.jobs.${id}.initial`)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-brand-midnight truncate text-sm font-semibold">
                  {t(`landing.preview.jobs.${id}.role`)}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {t(`landing.preview.jobs.${id}.company`)}
                </p>
              </div>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                {score}%
              </span>
              <ArrowRight className="size-4 text-slate-400 rtl:rotate-180" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const { error, isSubmitting, signInWithGoogle } = useGoogleSignIn();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="landing-shell text-brand-midnight relative min-h-svh overflow-hidden"
      dir={i18n.dir()}
    >
      <header className="sticky top-0 z-50 border-b border-slate-200/65 bg-white/76 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-17 w-full max-w-[88rem] items-center justify-between gap-4 px-4 sm:min-h-19 sm:px-8 lg:px-10">
          <Brand />
          <nav
            aria-label={t("landing.nav.label")}
            className="hidden items-center gap-1 rounded-xl border border-slate-200/70 bg-white/70 p-1 text-sm font-medium text-slate-600 md:flex"
          >
            <a
              className="rounded-lg px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950"
              href="#how-it-works"
            >
              {t("landing.nav.how")}
            </a>
            <a
              className="rounded-lg px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950"
              href="#product"
            >
              {t("landing.nav.product")}
            </a>
            <a
              className="rounded-lg px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950"
              href="#why-jobmiter"
            >
              {t("landing.nav.why")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageButton />
            <Button
              className="bg-brand-midnight hidden rounded-xl text-white shadow-md shadow-slate-950/12 hover:bg-slate-800 sm:inline-flex"
              onClick={() => void signInWithGoogle()}
              disabled={isSubmitting}
            >
              {t("landing.nav.start")}
              <ArrowRight
                aria-hidden="true"
                className="size-4 rtl:rotate-180"
              />
            </Button>
          </div>
        </div>
      </header>

      <section className="relative isolate mx-auto grid w-full max-w-[88rem] items-center gap-10 px-5 pt-14 pb-12 sm:px-8 sm:pt-18 sm:pb-16 lg:min-h-[46rem] lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:px-10 lg:py-16">
        <div
          aria-hidden="true"
          className="landing-rays absolute inset-0 -z-10"
        />
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 max-w-2xl"
        >
          <div className="text-brand-electric mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/70 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
            <Sparkles aria-hidden="true" className="size-3.5" />
            {t("landing.eyebrow")}
          </div>
          <h1 className="text-[clamp(3.15rem,7.4vw,6.35rem)] leading-[0.92] font-semibold tracking-[-0.065em] text-balance">
            {t("landing.titleStart")}{" "}
            <span className="relative inline-block whitespace-nowrap">
              <motion.span
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  delay: 0.42,
                  duration: 0.7,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute inset-x-[-0.04em] bottom-[0.02em] -z-10 h-[0.34em] origin-left -rotate-1 rounded-md bg-teal-300/72 rtl:origin-right"
              />
              {t("landing.titleAccent")}
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-pretty text-slate-600 sm:text-lg sm:leading-8">
            {t("landing.description")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="landing-pulse bg-brand-electric h-13 rounded-xl px-6 text-base text-white shadow-xl shadow-blue-500/18 hover:bg-blue-600"
              disabled={isSubmitting}
              onClick={() => void signInWithGoogle()}
            >
              {isSubmitting ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <GoogleMark />
              )}
              {isSubmitting ? t("auth.connecting") : t("landing.signIn")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              className="h-13 rounded-xl border-slate-300 bg-white/65 px-6 text-base backdrop-blur hover:bg-white"
              render={<a href="#how-it-works" />}
            >
              {t("landing.secondaryCta")}
              <ArrowRight
                aria-hidden="true"
                className="size-4 rtl:rotate-180"
              />
            </Button>
          </div>
          <div className="mt-4 max-w-xl">
            <PrivacyNotice context="signIn" />
          </div>
          <div aria-live="polite" className="min-h-6 pt-2 text-sm">
            {error ? <p className="text-red-600">{error}</p> : null}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnimatedMatchingMap />
        </motion.div>
      </section>

      <div
        dir="ltr"
        className="overflow-hidden border-y border-blue-100/80 bg-white/70 py-5 backdrop-blur"
      >
        <div
          dir="ltr"
          className="landing-marquee flex w-max text-sm font-bold tracking-[0.23em] whitespace-nowrap text-slate-700 uppercase motion-reduce:translate-x-0"
        >
          {[0, 1, 2, 3].map((segment) => (
            <div
              key={segment}
              dir={i18n.dir()}
              aria-hidden={segment > 0}
              className="flex min-w-[100vw] shrink-0 items-center justify-around gap-8 px-4"
            >
              <span>{t("landing.workflow.analysis")}</span>
              <Sparkles
                aria-hidden="true"
                className="text-brand-electric size-3"
              />
              <span>{t("landing.workflow.matches")}</span>
              <Sparkles aria-hidden="true" className="text-brand-teal size-3" />
              <span>{t("landing.workflow.focus")}</span>
              <Sparkles
                aria-hidden="true"
                className="text-brand-electric size-3"
              />
            </div>
          ))}
        </div>
      </div>

      <section
        id="how-it-works"
        className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-brand-electric text-xs font-bold tracking-[0.2em] uppercase">
              {t("landing.howEyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
              {t("landing.howItWorks")}
            </h2>
            <p className="mt-4 leading-7 text-pretty text-slate-600">
              {t("landing.howDescription")}
            </p>
          </Reveal>
          <ol className="relative mt-12 grid gap-4 lg:grid-cols-3">
            {STEPS.map(({ id, icon: Icon }, index) => (
              <Reveal key={id}>
                <li className="relative h-full overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 p-6 shadow-[var(--brand-shadow-card)] backdrop-blur sm:p-8">
                  <span className="text-brand-electric/8 absolute -end-2 -top-8 text-[8rem] leading-none font-black">
                    {index + 1}
                  </span>
                  <span className="bg-brand-midnight relative grid size-12 place-items-center rounded-2xl text-white shadow-lg shadow-slate-950/15">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="relative mt-8 text-xl font-semibold">
                    {t(`landing.steps.${id}.title`)}
                  </h3>
                  <p className="relative mt-3 text-sm leading-6 text-pretty text-slate-600">
                    {t(`landing.steps.${id}.description`)}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="product"
        className="scroll-mt-24 bg-white/72 px-5 py-20 backdrop-blur sm:px-8 sm:py-28"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <Reveal>
            <p className="text-brand-teal text-xs font-bold tracking-[0.2em] uppercase">
              {t("landing.product.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
              {t("landing.product.title")}
            </h2>
            <p className="mt-5 max-w-xl leading-7 text-pretty text-slate-600">
              {t("landing.product.description")}
            </p>
            <TrustPoints />
          </Reveal>
          <Reveal>
            <WorkspacePreview />
          </Reveal>
        </div>
      </section>

      <section
        id="why-jobmiter"
        className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <Reveal className="grid gap-7 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-brand-electric text-xs font-bold tracking-[0.2em] uppercase">
                {t("landing.pillars.eyebrow")}
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
                {t("landing.pillars.title")}
              </h2>
            </div>
            <p className="max-w-2xl leading-7 text-pretty text-slate-600 lg:justify-self-end">
              {t("landing.pillars.description")}
            </p>
          </Reveal>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ id, icon: Icon }, index) => (
              <Reveal key={id}>
                <div
                  className={`h-full rounded-3xl border p-6 ${
                    index === 2
                      ? "bg-brand-midnight border-blue-200 text-white shadow-xl shadow-slate-900/12"
                      : "border-slate-200/80 bg-white/82"
                  }`}
                >
                  <Icon
                    className={
                      index === 2
                        ? "text-brand-teal size-5"
                        : "text-brand-electric size-5"
                    }
                  />
                  <h3 className="mt-6 font-semibold">
                    {t(`landing.pillars.items.${id}.title`)}
                  </h3>
                  <p
                    className={`mt-2 text-sm leading-6 ${index === 2 ? "text-slate-300" : "text-slate-600"}`}
                  >
                    {t(`landing.pillars.items.${id}.description`)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="bg-brand-midnight relative mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] px-6 py-16 text-center text-white sm:px-10 sm:py-22">
          <div className="landing-cta-glow absolute inset-0" />
          <div className="relative mx-auto max-w-2xl">
            <JobmiterMark className="mx-auto size-13" variant="inverse" />
            <h2 className="mt-6 text-3xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
              {t("landing.cta.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-pretty text-slate-300">
              {t("landing.cta.description")}
            </p>
            <Button
              className="mt-8 h-13 rounded-xl bg-white px-6 text-base text-slate-950 hover:bg-slate-100"
              onClick={() => void signInWithGoogle()}
              disabled={isSubmitting}
            >
              <GoogleMark />
              {t("landing.cta.button")}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

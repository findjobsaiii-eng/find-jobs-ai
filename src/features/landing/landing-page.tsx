"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileCheck2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { JobmiterMark } from "@/components/ui/jobmiter-logo";
import { Brand } from "@/features/auth/brand";
import { GoogleMark } from "@/features/auth/google-mark";
import { LanguageButton } from "@/features/auth/language-button";
import { useGoogleSignIn } from "@/features/auth/use-google-sign-in";

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
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={false}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function HeroWorkflow() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const cards = [
    { id: "intent", icon: Search, tone: "electric" },
    { id: "analysis", icon: Sparkles, tone: "teal" },
    { id: "matches", icon: BriefcaseBusiness, tone: "electric" },
    { id: "focus", icon: UserRound, tone: "teal" },
  ] as const;

  return (
    <div className="relative mx-auto w-full max-w-[34rem] py-7 sm:py-10">
      <div
        aria-hidden="true"
        className="bg-brand-electric/20 absolute inset-10 rounded-full blur-3xl"
      />
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 18 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{
          delay: 0.16,
          duration: 0.65,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="relative rounded-[2rem] border border-white/15 bg-white/8 p-3 shadow-[var(--brand-shadow-hero)] backdrop-blur-sm sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between px-2 pt-1">
          <p className="text-sm font-semibold tracking-wide text-white">
            {t("landing.workflow.title")}
          </p>
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[0.68rem] font-medium text-white/75">
            <span className="bg-brand-teal size-1.5 rounded-full" />
            {t("landing.workflow.live")}
          </span>
        </div>
        <div className="space-y-2.5">
          {cards.map(({ id, icon: Icon, tone }, index) => (
            <motion.div
              key={id}
              animate={
                reducedMotion ? undefined : { y: [0, index % 2 ? -2 : 2, 0] }
              }
              transition={{
                duration: 5 + index,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.35,
              }}
              className="text-brand-midnight flex items-center gap-3 rounded-2xl border border-white/70 bg-white px-3.5 py-3.5 shadow-[var(--brand-shadow-card)] sm:px-4"
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                  tone === "teal"
                    ? "bg-brand-teal/12 text-brand-teal"
                    : "bg-brand-electric/10 text-brand-electric"
                }`}
              >
                <Icon aria-hidden="true" className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-pretty">
                  {t(`landing.workflow.${id}`)}
                </p>
                {id === "intent" ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t("landing.workflow.intentHint")}
                  </p>
                ) : null}
              </div>
              {id === "intent" ? (
                <span className="bg-brand-electric grid size-8 shrink-0 place-items-center rounded-lg text-white shadow-md shadow-blue-500/20">
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 rtl:rotate-180"
                  />
                </span>
              ) : (
                <span className="bg-brand-teal grid size-6 shrink-0 place-items-center rounded-full text-white">
                  <Check aria-hidden="true" className="size-3.5" />
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function ProductPreview() {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[var(--brand-shadow-preview)]">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 sm:px-6">
        <Brand />
        <div className="hidden items-center gap-5 text-xs font-medium text-slate-500 sm:flex">
          <span className="text-brand-electric">
            {t("landing.preview.navMatches")}
          </span>
          <span>{t("landing.preview.navProgress")}</span>
          <span>{t("landing.preview.navProfile")}</span>
        </div>
        <span className="bg-brand-electric grid size-8 place-items-center rounded-full text-xs font-semibold text-white">
          JD
        </span>
      </div>
      <div className="bg-brand-snow p-4 sm:p-7">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-brand-electric text-xs font-semibold tracking-[0.16em] uppercase">
              {t("landing.preview.eyebrow")}
            </p>
            <h3 className="text-brand-midnight mt-1.5 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {t("landing.preview.title")}
            </h3>
          </div>
          <span className="bg-brand-teal/10 self-start rounded-full px-3 py-1.5 text-xs font-semibold text-teal-700">
            {t("landing.preview.fresh")}
          </span>
        </div>
        <div className="grid gap-3">
          {PREVIEW_JOBS.map(({ id, score }, index) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none sm:p-4"
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl font-bold ${
                  index === 1
                    ? "bg-brand-teal/10 text-brand-teal"
                    : "bg-brand-electric/10 text-brand-electric"
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
              <span className="bg-brand-teal/10 rounded-full px-2.5 py-1 text-xs font-semibold text-teal-700">
                {score}%
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-slate-400 rtl:rotate-180"
              />
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
      className="bg-brand-snow text-brand-midnight relative min-h-svh overflow-hidden"
      dir={i18n.dir()}
    >
      <header className="bg-brand-snow/90 relative z-30 border-b border-slate-200/70 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Brand />
          <nav
            aria-label={t("landing.nav.label")}
            className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex"
          >
            <a
              className="hover:text-brand-midnight transition-colors"
              href="#how-it-works"
            >
              {t("landing.nav.how")}
            </a>
            <a
              className="hover:text-brand-midnight transition-colors"
              href="#product"
            >
              {t("landing.nav.product")}
            </a>
            <a
              className="hover:text-brand-midnight transition-colors"
              href="#why-jobmiter"
            >
              {t("landing.nav.why")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageButton />
            <Button
              className="bg-brand-midnight hover:bg-brand-midnight/90 hidden rounded-xl text-white sm:inline-flex"
              onClick={() => void signInWithGoogle()}
              disabled={isSubmitting}
            >
              {t("landing.nav.start")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[88rem] px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
        <section className="bg-brand-midnight relative isolate overflow-hidden rounded-[2rem] px-5 py-14 text-white sm:px-10 sm:py-18 lg:grid lg:min-h-[42rem] lg:grid-cols-[0.94fr_1.06fr] lg:items-center lg:gap-12 lg:px-16 lg:py-20">
          <div
            aria-hidden="true"
            className="bg-brand-electric/18 absolute -end-28 -top-24 -z-10 size-[32rem] rounded-full blur-3xl"
          />
          <div
            aria-hidden="true"
            className="bg-brand-teal/12 absolute start-1/3 -bottom-48 -z-10 size-[28rem] rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 max-w-2xl"
          >
            <p className="text-brand-teal mb-5 flex items-center gap-2 text-sm font-medium">
              <Sparkles aria-hidden="true" className="size-4" />
              {t("landing.eyebrow")}
            </p>
            <h1 className="text-[clamp(2.8rem,7vw,5.7rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-balance">
              {t("landing.titleStart")}{" "}
              <span className="text-brand-teal">
                {t("landing.titleAccent")}
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-pretty text-slate-300 sm:text-lg sm:leading-8">
              {t("landing.description")}
            </p>
            <div className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="text-brand-midnight hover:bg-brand-snow h-12 rounded-xl bg-white px-5 text-base shadow-lg shadow-black/15"
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
              <Button
                variant="outline"
                size="lg"
                nativeButton={false}
                className="h-12 rounded-xl border-white/20 bg-white/6 px-5 text-base text-white hover:bg-white/12 hover:text-white"
                render={<a href="#how-it-works" />}
              >
                {t("landing.secondaryCta")}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 rtl:rotate-180"
                />
              </Button>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              {t("landing.privacy")}
            </p>
            <div aria-live="polite" className="min-h-6 pt-2 text-sm">
              {error ? <p className="text-red-300">{error}</p> : null}
            </div>
          </motion.div>
          <HeroWorkflow />
        </section>
      </div>

      <section
        id="how-it-works"
        className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-brand-electric text-sm font-semibold tracking-[0.16em] uppercase">
              {t("landing.howEyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
              {t("landing.howItWorks")}
            </h2>
            <p className="mt-4 leading-7 text-pretty text-slate-600">
              {t("landing.howDescription")}
            </p>
          </Reveal>
          <ol className="mt-12 grid gap-4 lg:grid-cols-3">
            {STEPS.map(({ id, icon: Icon }, index) => (
              <Reveal key={id}>
                <li className="group h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--brand-shadow-card)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[var(--brand-shadow-card-hover)] motion-reduce:transition-none sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="bg-brand-electric/10 text-brand-electric group-hover:bg-brand-electric grid size-12 place-items-center rounded-2xl transition-colors group-hover:text-white">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="text-xs font-semibold tracking-[0.18em] text-slate-400">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-semibold text-balance">
                    {t(`landing.steps.${id}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-pretty text-slate-600">
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
        className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
          <Reveal>
            <p className="text-brand-teal text-sm font-semibold tracking-[0.16em] uppercase">
              {t("landing.product.eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
              {t("landing.product.title")}
            </h2>
            <p className="mt-5 max-w-xl leading-7 text-pretty text-slate-600">
              {t("landing.product.description")}
            </p>
            <ul className="mt-7 space-y-3">
              {["focused", "transparent", "progress"].map((id) => (
                <li
                  key={id}
                  className="flex items-start gap-3 text-sm font-medium text-slate-700"
                >
                  <span className="bg-brand-teal mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white">
                    <Check aria-hidden="true" className="size-3" />
                  </span>
                  <span>{t(`landing.product.points.${id}`)}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal>
            <ProductPreview />
          </Reveal>
        </div>
      </section>

      <section
        id="why-jobmiter"
        className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <Reveal className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-brand-electric text-sm font-semibold tracking-[0.16em] uppercase">
                {t("landing.pillars.eyebrow")}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
                {t("landing.pillars.title")}
              </h2>
            </div>
            <p className="max-w-2xl leading-7 text-pretty text-slate-600 lg:justify-self-end">
              {t("landing.pillars.description")}
            </p>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ id, icon: Icon }) => (
              <div key={id} className="bg-white p-6 sm:p-7">
                <Icon
                  aria-hidden="true"
                  className="text-brand-electric size-5"
                />
                <h3 className="mt-5 font-semibold">
                  {t(`landing.pillars.items.${id}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-pretty text-slate-600">
                  {t(`landing.pillars.items.${id}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-3 pb-3 sm:px-6 sm:pb-6 lg:px-8">
        <Reveal className="bg-brand-midnight mx-auto flex max-w-[84rem] flex-col items-center rounded-[2rem] px-6 py-16 text-center text-white sm:py-20">
          <JobmiterMark className="size-12" />
          <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {t("landing.cta.title")}
          </h2>
          <p className="mt-4 max-w-xl leading-7 text-pretty text-slate-300">
            {t("landing.cta.description")}
          </p>
          <Button
            size="lg"
            className="text-brand-midnight hover:bg-brand-snow mt-8 h-12 rounded-xl bg-white px-6 text-base"
            disabled={isSubmitting}
            onClick={() => void signInWithGoogle()}
          >
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <GoogleMark />
            )}
            {t("landing.cta.button")}
          </Button>
        </Reveal>
      </section>

      <footer className="px-5 py-9 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-start">
          <Brand />
          <p className="text-xs text-slate-500">{t("landing.footer")}</p>
        </div>
      </footer>
    </main>
  );
}

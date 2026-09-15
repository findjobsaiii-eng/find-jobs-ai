"use client";

import { BriefcaseBusiness, Check, FileText, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { JobmiterMark } from "@/components/ui/jobmiter-logo";

const JOBS = [
  { id: "product", score: 94 },
  { id: "frontend", score: 89 },
  { id: "design", score: 86 },
] as const;

function Beam({ path, delay }: { path: string; delay: number }) {
  const reducedMotion = useReducedMotion();

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="rgba(59,130,246,.18)"
        strokeWidth="1.35"
      />
      <motion.path
        d={path}
        fill="none"
        stroke="url(#beam-gradient)"
        strokeLinecap="round"
        strokeWidth="1.65"
        strokeDasharray="9 54"
        initial={{ strokeDashoffset: 60 }}
        animate={reducedMotion ? undefined : { strokeDashoffset: -66 }}
        transition={{
          duration: 3.2,
          delay,
          ease: "linear",
          repeat: Infinity,
        }}
      />
    </>
  );
}

export function AnimatedMatchingMap() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-[42rem]">
      <div className="absolute inset-5 rounded-[2.5rem] bg-blue-400/15 blur-3xl" />
      <div className="relative min-h-[29rem] overflow-hidden rounded-[2rem] border border-white/65 bg-white/72 p-4 shadow-[var(--brand-shadow-preview)] backdrop-blur-2xl sm:min-h-[32rem] sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-midnight text-sm font-semibold">
              {t("landing.workflow.title")}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("landing.workflow.live")}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-teal-200/70 bg-teal-50 px-3 py-1.5 text-[0.68rem] font-semibold text-teal-700">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-50 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-teal-500" />
            </span>
            {t("landing.preview.fresh")}
          </span>
        </div>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="beam-gradient" x1="0" x2="1">
              <stop offset="0" stopColor="#14b8a6" />
              <stop offset="1" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <Beam path="M 18 42 C 31 42, 34 56, 49 56" delay={0} />
          <Beam path="M 51 56 C 64 56, 65 35, 81 35" delay={0.2} />
          <Beam path="M 51 56 C 64 56, 65 56, 81 56" delay={0.75} />
          <Beam path="M 51 56 C 64 56, 65 77, 81 77" delay={1.3} />
        </svg>

        <motion.div
          animate={reducedMotion ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute start-[6%] top-[34%] z-10 w-[31%] max-w-40 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-lg shadow-slate-900/8 sm:p-4"
        >
          <span className="bg-brand-electric/10 text-brand-electric grid size-10 place-items-center rounded-xl">
            <FileText aria-hidden="true" className="size-5" />
          </span>
          <p className="text-brand-midnight mt-3 text-sm leading-5 font-semibold">
            {t("landing.workflow.intent")}
          </p>
          <p className="mt-1 hidden text-[0.68rem] leading-4 text-slate-500 sm:block">
            {t("landing.workflow.intentHint")}
          </p>
        </motion.div>

        <motion.div
          animate={reducedMotion ? undefined : { scale: [1, 1.035, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
          className="bg-brand-midnight absolute start-1/2 top-[49%] z-20 grid size-18 -translate-x-1/2 place-items-center rounded-[1.4rem] border border-white/10 shadow-xl shadow-slate-950/25 sm:size-21 rtl:translate-x-1/2"
        >
          <span className="absolute -inset-2 rounded-[1.7rem] border border-blue-300/25" />
          <JobmiterMark className="size-10 sm:size-12" variant="inverse" />
          <Sparkles className="text-brand-teal absolute -end-1 -top-1 size-4" />
        </motion.div>

        <div className="absolute end-[4%] top-[25%] z-10 w-[38%] space-y-2.5 sm:end-[5%] sm:w-[36%]">
          {JOBS.map(({ id, score }, index) => (
            <motion.div
              key={id}
              initial={reducedMotion ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 + index * 0.13, duration: 0.45 }}
              className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-md shadow-slate-900/6 sm:p-3.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="bg-brand-electric/8 text-brand-electric grid size-8 shrink-0 place-items-center rounded-lg">
                  <BriefcaseBusiness aria-hidden="true" className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-brand-midnight truncate text-[0.7rem] font-semibold sm:text-xs">
                    <span className="sm:hidden">
                      {t(`landing.preview.jobs.${id}.initial`)}
                    </span>
                    <span className="hidden sm:inline">
                      {t(`landing.preview.jobs.${id}.role`)}
                    </span>
                  </p>
                  <p className="mt-0.5 hidden truncate text-[0.62rem] text-slate-500 sm:block">
                    {t(`landing.preview.jobs.${id}.company`)}
                  </p>
                </div>
                <span className="rounded-full bg-teal-50 px-1.5 py-1 text-[0.6rem] font-bold text-teal-700 sm:px-2">
                  {score}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl border border-white/75 bg-white/64 px-4 py-3 text-[0.68rem] font-medium text-slate-600 backdrop-blur-xl sm:inset-x-6 sm:bottom-6">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-3.5 text-teal-600" />
            {t("landing.product.points.focused")}
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Check className="size-3.5 text-teal-600" />
            {t("landing.product.points.transparent")}
          </span>
        </div>
      </div>
    </div>
  );
}

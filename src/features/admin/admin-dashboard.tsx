"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleX,
  Coins,
  Eye,
  Gauge,
  LoaderCircle,
  Mail,
  MousePointerClick,
  Repeat2,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import * as m from "motion/react-m";
import { useTranslation } from "react-i18next";
import { AuthBoundary } from "@/features/auth/auth-gate";
import { SignInScreen } from "@/features/auth/sign-in-screen";
import { Brand } from "@/features/auth/brand";
import { Button } from "@/components/ui/button";
import { useAdminUsers } from "./use-admin-users";
import { CatalogReview } from "./catalog-review";
import { cn } from "@/lib/utils";

type Section =
  | "overview"
  | "users"
  | "searches"
  | "tokenUsage"
  | "jobs"
  | "inspector"
  | "catalog";

function israelDateKey(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function experienceRequirement(
  min: number | null,
  max: number | null,
  unknown: string,
) {
  if (min === null) return unknown;
  if (max !== null && max !== min) return `${min}-${max}`;
  return max === null ? `${min}+` : String(min);
}

function prettyProviderJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function JobDiagnosticDisclosure({
  jobId,
  defaultOpen = false,
}: {
  jobId: Id<"jobs">;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const detail = useQuery(api.admin.getJobDetail, open ? { jobId } : "skip");
  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-semibold transition-colors"
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
        {open ? t("admin.diagnostics.hide") : t("admin.diagnostics.show")}
      </button>
      {open ? (
        !detail ? (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <LoaderCircle className="size-3.5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="bg-muted/60 rounded-lg p-2.5">
                <p className="text-muted-foreground">
                  {t("admin.diagnostics.resolvedExperience")}
                </p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {experienceRequirement(
                    detail.experience.resolvedMin,
                    detail.experience.resolvedMax,
                    t("admin.diagnostics.unknown"),
                  )}
                </p>
              </div>
              <div className="bg-muted/60 rounded-lg p-2.5">
                <p className="text-muted-foreground">
                  {t("admin.diagnostics.storedExperience")}
                </p>
                <p className="mt-0.5 font-semibold tabular-nums">
                  {experienceRequirement(
                    detail.experience.storedMin,
                    detail.experience.storedMax,
                    t("admin.diagnostics.unknown"),
                  )}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold">
                {t("admin.diagnostics.normalized")}
              </p>
              <pre
                dir="ltr"
                className="bg-brand-midnight max-h-80 overflow-auto rounded-xl p-3 text-start text-[11px] leading-5 text-slate-100"
              >
                {detail.normalizedJson}
              </pre>
            </div>
            {detail.providerJson ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold">
                  {t("admin.diagnostics.provider")}
                </p>
                <pre
                  dir="ltr"
                  className="bg-muted max-h-64 overflow-auto rounded-xl p-3 text-start text-[11px] leading-5"
                >
                  {prettyProviderJson(detail.providerJson)}
                </pre>
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

function zonedDateParts(timestamp: number) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(timestamp)
    .reduce<Record<string, number>>((result, part) => {
      if (part.type !== "literal") result[part.type] = Number(part.value);
      return result;
    }, {});
  return values;
}

function israelMidnight(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day);
  let guess = desiredUtc;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = zonedDateParts(guess);
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess -= representedUtc - desiredUtc;
  }
  return guess;
}

function dateRange(dateKey: string) {
  const start = israelMidnight(dateKey);
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextKey = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return { start, end: israelMidnight(nextKey) };
}

function formatDateTime(value: number | null, language: string) {
  if (value === null) return "—";
  return new Intl.DateTimeFormat(language, {
    timeZone: "Asia/Jerusalem",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatShortDate(value: number, language: string) {
  return new Intl.DateTimeFormat(language, {
    timeZone: "Asia/Jerusalem",
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatPercentage(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function displayUser(user: { email: string | null; name: string | null }) {
  return user.name || user.email || "Unknown user";
}

function StatusPill({ status }: { status: string }) {
  const successful = ["completed", "eligible", "verified_active"].includes(
    status,
  );
  const warning = ["queued", "running", "planned", "reused"].includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide uppercase",
        successful
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : warning
            ? "bg-amber-500/12 text-amber-800 dark:text-amber-300"
            : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function LoadingBlock() {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground grid min-h-56 place-items-center text-sm">
      <span className="flex items-center gap-2">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {t("admin.loading")}
      </span>
    </div>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground grid min-h-40 place-items-center px-6 text-center text-sm">
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  detail,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "blue" | "teal" | "amber" | "rose";
  detail?: string;
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    amber: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
  return (
    <m.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-border bg-card rounded-2xl border p-4 shadow-sm"
    >
      <span
        className={cn("grid size-9 place-items-center rounded-xl", tones[tone])}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-5 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs font-medium">{label}</p>
      {detail ? (
        <p className="text-muted-foreground mt-2 text-[11px]">{detail}</p>
      ) : null}
    </m.article>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="border-input bg-background focus-within:ring-ring/30 flex h-10 items-center gap-2 rounded-xl border px-3 focus-within:ring-3">
      <Search className="text-muted-foreground size-4" aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      {value ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onChange("")}
          aria-label={t("admin.actions.clear")}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </label>
  );
}

function Overview({ dateKey }: { dateKey: string }) {
  const { t, i18n } = useTranslation();
  const range = useMemo(() => dateRange(dateKey), [dateKey]);
  const requestMetrics = useMutation(api.admin.requestMetrics);
  useEffect(() => {
    void requestMetrics({ dayKey: dateKey, ...range });
  }, [dateKey, range, requestMetrics]);
  const data = useQuery(api.admin.overview, { dayKey: dateKey, ...range });
  const decision = useQuery(api.admin.decisionMetrics, { now: range.end });
  const {
    results: users,
    status: usersStatus,
    loadMore: loadMoreUsers,
  } = useAdminUsers();
  if (!data || !decision || usersStatus === "LoadingFirstPage")
    return <LoadingBlock />;
  const usersWithoutJobs = users.filter(
    (user) => user.onboardingCompleted && user.indexedMatches === 0,
  );
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">
        {t("admin.overview.snapshotNotice")}
      </p>
      {data.truncated || decision.truncated ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("admin.overview.truncated")}
        </div>
      ) : null}
      <LazyMotion features={domAnimation}>
        <section
          aria-labelledby="decision-title"
          className={cn(
            "rounded-2xl border p-5",
            decision.decision === "promising"
              ? "border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20"
              : decision.decision === "weak"
                ? "border-rose-300/60 bg-rose-50 dark:bg-rose-950/20"
                : "border-blue-300/60 bg-blue-50 dark:bg-blue-950/20",
          )}
        >
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t("admin.decision.eyebrow")}
          </p>
          <h2 id="decision-title" className="mt-1 text-xl font-semibold">
            {t(`admin.decision.status.${decision.decision}.title`)}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            {t(`admin.decision.status.${decision.decision}.description`)}
          </p>
          {decision.trackingStartedAt ? (
            <p className="text-muted-foreground mt-3 text-xs">
              {t("admin.decision.trackingSince", {
                date: formatDateTime(decision.trackingStartedAt, i18n.language),
              })}
            </p>
          ) : null}
        </section>
        <section aria-labelledby="decision-metrics-title" className="mt-6">
          <h2 id="decision-metrics-title" className="mb-3 font-semibold">
            {t("admin.decision.title")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label={t("admin.metrics.weeklyActiveUsers")}
              value={decision.weeklyActiveUsers}
              icon={Users}
            />
            <MetricCard
              label={t("admin.decision.weeklyCoreUsers")}
              value={decision.weeklyCoreUsers}
              icon={Activity}
              tone="teal"
              detail={t("admin.decision.coreUsersDetail", {
                actions: decision.coreActions,
              })}
            />
            <MetricCard
              label={t("admin.decision.retainedUsers")}
              value={decision.retainedCoreUsers}
              icon={Repeat2}
              tone="teal"
              detail={t("admin.decision.retainedUsersDetail", {
                previous: decision.priorWeekCoreUsers,
              })}
            />
            <MetricCard
              label={t("admin.decision.rollingRetention")}
              value={formatPercentage(decision.rollingRetentionRate)}
              icon={Repeat2}
              tone="teal"
            />
            <MetricCard
              label={t("admin.decision.activationRate")}
              value={formatPercentage(decision.activationRate)}
              icon={Target}
              detail={t("admin.decision.activationDetail", {
                activated: decision.activatedSignups,
                eligible: decision.maturedSignups,
              })}
            />
            <MetricCard
              label={t("admin.decision.cohortRetention")}
              value={formatPercentage(decision.cohortRetentionRate)}
              icon={Repeat2}
              detail={t("admin.decision.cohortRetentionDetail", {
                retained: decision.retainedUsers,
                eligible: decision.retentionEligibleActivated,
              })}
            />
            <MetricCard
              label={t("admin.decision.averageActiveDays")}
              value={decision.averageActiveDays ?? "—"}
              icon={CalendarDays}
            />
          </div>
        </section>
        <section className="border-border bg-card mt-6 overflow-hidden rounded-2xl border shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">{t("admin.decision.cohorts")}</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("admin.decision.cohortsDescription")}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">
                    {t("admin.decision.cohort")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("admin.decision.signups")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("admin.decision.activated")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("admin.decision.returned")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {decision.cohorts.map((cohort) => (
                  <tr key={cohort.start}>
                    <td className="px-5 py-3 font-medium">
                      {formatShortDate(cohort.start, i18n.language)}–
                      {formatShortDate(cohort.end - 1, i18n.language)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{cohort.signups}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {cohort.activated}/{cohort.signups}
                      <span className="text-muted-foreground ms-2 text-xs">
                        {formatPercentage(cohort.activationRate)}
                      </span>
                      {!cohort.activationMatured ? (
                        <span className="text-muted-foreground ms-2 text-[10px] font-semibold uppercase">
                          {t("admin.decision.collecting")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {cohort.retained}/{cohort.activated}
                      <span className="text-muted-foreground ms-2 text-xs">
                        {formatPercentage(cohort.retentionRate)}
                      </span>
                      {!cohort.retentionMatured ? (
                        <span className="text-muted-foreground ms-2 text-[10px] font-semibold uppercase">
                          {t("admin.decision.collecting")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="daily-signals-title" className="mt-6">
          <h2 id="daily-signals-title" className="mb-3 font-semibold">
            {t("admin.decision.daySignals")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label={t("admin.metrics.jobsSaved")}
              value={data.jobsSaved}
              icon={Bookmark}
            />
            <MetricCard
              label={t("admin.metrics.jobSourceClicks")}
              value={data.jobSourceClicks}
              icon={MousePointerClick}
            />
            <MetricCard
              label={t("admin.metrics.applicationUpdates")}
              value={data.applicationUpdates}
              icon={CheckCircle2}
            />
          </div>
        </section>
        <section aria-labelledby="email-signals-title" className="mt-6">
          <h2 id="email-signals-title" className="mb-3 font-semibold">
            {t("admin.decision.emailSignals")}
          </h2>
          <p className="text-muted-foreground -mt-2 mb-3 text-xs">
            {t("admin.decision.emailSignalsDescription")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label={t("admin.metrics.emailsDelivered")}
              value={data.emailsDelivered}
              icon={Mail}
              tone="amber"
            />
            <MetricCard
              label={t("admin.metrics.emailsOpened")}
              value={data.emailsOpened}
              icon={Mail}
              tone="amber"
            />
            <MetricCard
              label={t("admin.metrics.emailsClicked")}
              value={data.emailsClicked}
              icon={MousePointerClick}
              tone="amber"
            />
          </div>
        </section>
        <section aria-labelledby="operations-metrics-title">
          <h2 id="operations-metrics-title" className="mt-6 mb-3 font-semibold">
            {t("admin.overview.operations")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={t("admin.metrics.totalUsers")}
              value={data.totalUsers}
              icon={Users}
            />
            <MetricCard
              label={t("admin.metrics.newUsers")}
              value={data.newUsers}
              icon={Sparkles}
              tone="teal"
            />
            <MetricCard
              label={t("admin.metrics.searchesAttempted")}
              value={data.searchesAttempted}
              icon={Search}
            />
            <MetricCard
              label={t("admin.metrics.searchesSkipped")}
              value={data.searchesSkipped}
              icon={CalendarDays}
              tone="amber"
            />
            <MetricCard
              label={t("admin.metrics.jobsFound")}
              value={data.jobsFound}
              icon={BriefcaseBusiness}
              tone="teal"
            />
            <MetricCard
              label={t("admin.metrics.jobsInserted")}
              value={data.jobsInserted}
              icon={Activity}
            />
            <MetricCard
              label={t("admin.metrics.matchesCreated")}
              value={data.matchesCreated}
              icon={CheckCircle2}
              tone="teal"
            />
            <MetricCard
              label={t("admin.metrics.failures")}
              value={data.failures}
              icon={AlertTriangle}
              tone="rose"
            />
          </div>
        </section>
      </LazyMotion>
      <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">{t("admin.overview.attention")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("admin.overview.attentionDescription")}
            </p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
            {usersWithoutJobs.length}
          </span>
        </div>
        <div className="mt-4 divide-y">
          {usersWithoutJobs.slice(0, 8).map(({ user }) => (
            <div
              key={user.userId}
              className="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{displayUser(user)}</p>
                <p className="text-muted-foreground text-xs">{user.email}</p>
              </div>
              <span className="text-muted-foreground text-xs">
                {t("admin.overview.noVisibleJobs")}
              </span>
            </div>
          ))}
          {!usersWithoutJobs.length ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("admin.overview.allHealthy")}
            </p>
          ) : null}
        </div>
        <UsersLoadMore status={usersStatus} loadMore={loadMoreUsers} />
      </section>
    </div>
  );
}

function Searches({ dateKey }: { dateKey: string }) {
  const { t, i18n } = useTranslation();
  const [selectedRun, setSelectedRun] = useState<Id<"jobSearchRuns"> | null>(
    null,
  );
  const range = useMemo(() => dateRange(dateKey), [dateKey]);
  const data = useQuery(api.admin.listSearches, { dayKey: dateKey, ...range });
  const detail = useQuery(
    api.admin.getSearchDetail,
    selectedRun ? { runId: selectedRun } : "skip",
  );
  if (!data) return <LoadingBlock />;
  return (
    <div className="space-y-6">
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">{t("admin.searches.runs")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("admin.searches.runsDescription")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-5 py-3 text-start font-medium">
                  {t("admin.columns.user")}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t("admin.columns.time")}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t("admin.columns.status")}
                </th>
                <th className="px-4 py-3 text-end font-medium">
                  {t("admin.columns.found")}
                </th>
                <th className="px-4 py-3 text-end font-medium">
                  {t("admin.columns.new")}
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.runs.map((run) => (
                <tr
                  key={run.runId}
                  className="hover:bg-muted/35 transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{displayUser(run.user)}</p>
                    <p className="text-muted-foreground text-xs">
                      {run.user.email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {formatDateTime(run.startedAt, i18n.language)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={run.status} />
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {run.acceptedCount}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {run.insertedCount}
                  </td>
                  <td className="px-5 py-3 text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedRun(run.runId)}
                    >
                      {t("admin.actions.inspect")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.runs.length ? (
            <EmptyBlock>{t("admin.searches.noRuns")}</EmptyBlock>
          ) : null}
        </div>
      </section>

      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">{t("admin.searches.schedule")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("admin.searches.scheduleDescription")}
          </p>
        </div>
        <div className="divide-y">
          {data.scheduled.map((item) => (
            <div
              key={item.auditId}
              className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div>
                <p className="text-sm font-medium">{displayUser(item.user)}</p>
                <p className="text-muted-foreground text-xs">
                  {item.user.email}
                </p>
              </div>
              <StatusPill status={item.status} />
              <div className="sm:min-w-52 sm:text-end">
                <p className="text-sm">
                  {item.reason?.replaceAll("_", " ") ?? "—"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("admin.searches.attempts", { count: item.attemptCount })}
                </p>
              </div>
            </div>
          ))}
          {!data.scheduled.length ? (
            <EmptyBlock>{t("admin.searches.noScheduleData")}</EmptyBlock>
          ) : null}
        </div>
      </section>

      <AnimatePresence>
        {selectedRun ? (
          <m.div
            className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedRun(null)}
          >
            <m.aside
              className="bg-background h-full w-full max-w-2xl overflow-y-auto border-s shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 38 }}
              onClick={(event) => event.stopPropagation()}
              aria-label={t("admin.searches.detailTitle")}
            >
              <div className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 backdrop-blur">
                <h2 className="font-semibold">
                  {t("admin.searches.detailTitle")}
                </h2>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedRun(null)}
                  aria-label={t("admin.actions.close")}
                >
                  <X />
                </Button>
              </div>
              {!detail ? (
                <LoadingBlock />
              ) : (
                <div className="space-y-6 p-5">
                  <div>
                    <p className="text-lg font-semibold">
                      {displayUser(detail.run.user)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusPill status={detail.run.status} />
                      {detail.run.resultSource ? (
                        <StatusPill status={detail.run.resultSource} />
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      [
                        t("admin.columns.candidates"),
                        detail.run.returnedCandidateCount,
                      ],
                      [t("admin.columns.accepted"), detail.run.acceptedCount],
                      [t("admin.columns.inserted"), detail.run.insertedCount],
                      [
                        t("admin.columns.deduplicated"),
                        detail.run.deduplicatedCount,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="bg-muted/60 rounded-xl p-3"
                      >
                        <p className="text-xl font-semibold tabular-nums">
                          {value}
                        </p>
                        <p className="text-muted-foreground text-xs">{label}</p>
                      </div>
                    ))}
                  </div>
                  {detail.run.errorCategory ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                      <p className="font-semibold">
                        {detail.run.errorCategory}
                      </p>
                      {detail.providerDiagnostics?.errorMessage ? (
                        <p className="mt-1">
                          {detail.providerDiagnostics.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <h3 className="text-sm font-semibold">
                      {t("admin.searches.generatedQueries")}
                    </h3>
                    <div className="mt-2 space-y-2">
                      {detail.run.generatedQueries.map((query, index) => (
                        <p
                          key={`${index}-${query}`}
                          className="bg-muted rounded-xl px-3 py-2 text-sm"
                        >
                          {query}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">
                      {t("admin.searches.jobs")}
                    </h3>
                    <div className="mt-2 divide-y rounded-xl border">
                      {detail.jobs.map((job) => (
                        <div key={job.jobId} className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{job.title}</p>
                              <p className="text-muted-foreground text-xs">
                                {job.companyName}
                              </p>
                            </div>
                            {job.relevanceScore !== null ? (
                              <span className="text-sm font-semibold tabular-nums">
                                {job.relevanceScore}
                              </span>
                            ) : null}
                          </div>
                          {job.exclusionReasons.length ? (
                            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
                              {job.exclusionReasons.join(" · ")}
                            </p>
                          ) : null}
                          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span>
                              {t("admin.diagnostics.experience")}:{" "}
                              {experienceRequirement(
                                job.requiredExperienceYearsMin,
                                job.requiredExperienceYearsMax,
                                t("admin.diagnostics.unknown"),
                              )}
                            </span>
                            {job.locationText ? (
                              <span>{job.locationText}</span>
                            ) : null}
                          </div>
                          <JobDiagnosticDisclosure jobId={job.jobId} />
                        </div>
                      ))}
                      {!detail.jobs.length ? (
                        <EmptyBlock>{t("admin.searches.noJobs")}</EmptyBlock>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </m.aside>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function UserInsight({
  userId,
  onClose,
}: {
  userId: Id<"users">;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const data = useQuery(api.admin.getUserInsight, { userId });
  if (!data) return <LoadingBlock />;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{displayUser(data.user)}</p>
          <p className="text-muted-foreground text-sm">{data.user.email}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                href={`/admin/users/${userId}/jobs`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <Eye aria-hidden="true" />
            {t("admin.preview.action")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("admin.actions.close")}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="bg-muted/50 rounded-xl p-4 text-sm">
        <p className="font-medium">
          {data.profile.completed
            ? t("admin.users.profileReady")
            : t("admin.users.profileIncomplete")}
        </p>
        {data.profile.location ? (
          <p className="text-muted-foreground mt-1">
            {data.profile.location} · {data.profile.radiusKm} km
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-3 text-sm">
          <p className="text-muted-foreground text-xs font-medium">
            {t("admin.users.lastSeen")}
          </p>
          <p className="mt-1 font-semibold">
            {formatDateTime(data.activity.lastSeenAt, i18n.language)}
          </p>
        </div>
        <div className="rounded-xl border p-3 text-sm">
          <p className="text-muted-foreground text-xs font-medium">
            {t("admin.users.lastMeaningfulAction")}
          </p>
          <p className="mt-1 font-semibold">
            {formatDateTime(
              data.activity.lastMeaningfulActionAt,
              i18n.language,
            )}
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">
          {t("admin.users.emailEngagement")}
        </h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
          {(
            [
              ["sent", data.email.sent],
              ["delivered", data.email.delivered],
              ["opened", data.email.opened],
              ["clicked", data.email.clicked],
              ["bounced", data.email.bounced],
              ["complained", data.email.complained],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="bg-muted rounded-lg px-2 py-3">
              <p className="text-lg font-semibold tabular-nums">{value}</p>
              <p className="text-muted-foreground">
                {t(`admin.users.email.${label}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">
          {t("admin.users.recentActivity")}
        </h3>
        <div className="mt-2 divide-y rounded-xl border">
          {data.activity.recentEvents.slice(0, 12).map((event) => (
            <div
              key={`${event.event}-${event.occurredAt}`}
              className="flex items-center justify-between gap-3 p-3 text-xs"
            >
              <span className="font-medium">
                {t(`admin.users.events.${event.event}`)}
              </span>
              <span className="text-muted-foreground">
                {formatDateTime(event.occurredAt, i18n.language)}
              </span>
            </div>
          ))}
          {!data.activity.recentEvents.length ? (
            <p className="text-muted-foreground p-5 text-center text-xs">
              {t("admin.users.noActivity")}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">
          {t("admin.users.visibleJobs")}
        </h3>
        <div className="mt-2 divide-y rounded-xl border">
          {data.visibleJobs.map((job) => (
            <div
              key={job.jobId}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{job.title}</p>
                <p className="text-muted-foreground text-xs">
                  {job.companyName}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("admin.diagnostics.experience")}:{" "}
                  {experienceRequirement(
                    job.requiredExperienceYearsMin,
                    job.requiredExperienceYearsMax,
                    t("admin.diagnostics.unknown"),
                  )}
                  {job.locationText ? ` · ${job.locationText}` : ""}
                </p>
                <JobDiagnosticDisclosure jobId={job.jobId} />
              </div>
              <span className="font-semibold tabular-nums">
                {job.relevanceScore}
              </span>
            </div>
          ))}
          {!data.visibleJobs.length ? (
            <EmptyBlock>{t("admin.users.noVisibleJobs")}</EmptyBlock>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TokenUsage({ dateKey }: { dateKey: string }) {
  const { t, i18n } = useTranslation();
  const range = useMemo(() => dateRange(dateKey), [dateKey]);
  const data = useQuery(api.admin.tokenUsage, range);
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const usdFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }),
    [i18n.language],
  );
  if (!data) return <LoadingBlock />;
  const number = (value: number) => numberFormatter.format(value);
  const usd = (value: number | null) =>
    value === null
      ? t("admin.tokenUsage.unavailable")
      : usdFormatter.format(value);
  const operationLabel = (operation: string) =>
    t(`admin.tokenUsage.operations.${operation}`);
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        {t("admin.tokenUsage.description")}{" "}
        <a
          href="https://developers.openai.com/api/docs/pricing"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline underline-offset-2"
        >
          {t("admin.tokenUsage.pricingLink")}
        </a>
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {data.totals.map((item) => (
          <section
            key={item.operation}
            className="border-border bg-card rounded-2xl border p-4 shadow-sm"
          >
            <p className="text-muted-foreground text-xs font-medium">
              {operationLabel(item.operation)}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {usd(item.estimatedUsd)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("admin.tokenUsage.summary", {
                calls: number(item.requests),
                input: number(item.inputTokens),
                output: number(item.outputTokens),
                searches: number(item.webSearchCalls),
              })}
            </p>
            {item.unpricedRequests || item.unmeasuredRequests ? (
              <p className="mt-2 text-xs text-amber-700">
                {t("admin.tokenUsage.incomplete", {
                  unpriced: item.unpricedRequests,
                  unmeasured: item.unmeasuredRequests,
                })}
              </p>
            ) : null}
          </section>
        ))}
      </div>
      {data.truncated ? (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          {t("admin.tokenUsage.truncated")}
        </p>
      ) : null}
      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-3 text-start font-medium">
                  {t("admin.tokenUsage.action")}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t("admin.columns.time")}
                </th>
                <th className="px-4 py-3 text-end font-medium">
                  {t("admin.tokenUsage.input")}
                </th>
                <th className="px-4 py-3 text-end font-medium">
                  {t("admin.tokenUsage.output")}
                </th>
                <th className="px-4 py-3 text-end font-medium">
                  {t("admin.tokenUsage.webCalls")}
                </th>
                <th className="px-4 py-3 text-end font-medium">
                  {t("admin.tokenUsage.estimatedCost")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {operationLabel(row.operation)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {row.model}
                      {row.requestCount > 1
                        ? ` · ${t("admin.tokenUsage.responses", {
                            count: row.requestCount,
                          })}`
                        : ""}
                      {row.historicalSearch
                        ? ` · ${t("admin.tokenUsage.historical")}`
                        : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {formatDateTime(row.startedAt, i18n.language)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {row.inputTokens === null
                      ? t("admin.tokenUsage.unavailable")
                      : number(row.inputTokens)}
                    {row.cachedInputTokens ? (
                      <p className="text-muted-foreground text-xs">
                        {t("admin.tokenUsage.cached", {
                          count: number(row.cachedInputTokens),
                        })}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {row.outputTokens === null
                      ? t("admin.tokenUsage.unavailable")
                      : number(row.outputTokens)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {number(row.webSearchCalls)}
                  </td>
                  <td className="px-4 py-3 text-end font-medium tabular-nums">
                    {usd(row.estimatedUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length ? (
          <EmptyBlock>{t("admin.tokenUsage.empty")}</EmptyBlock>
        ) : null}
      </div>
    </div>
  );
}

function UsersLoadMore({
  status,
  loadMore,
}: {
  status: string;
  loadMore: (count: number) => void;
}) {
  const { t } = useTranslation();
  if (status !== "CanLoadMore" && status !== "LoadingMore") return null;
  return (
    <div className="p-4">
      <Button
        variant="outline"
        disabled={status === "LoadingMore"}
        onClick={() => loadMore(20)}
      >
        {t("admin.users.loadMore")}
      </Button>
    </div>
  );
}

function UsersSection() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const {
    results: users,
    status: usersStatus,
    loadMore: loadMoreUsers,
  } = useAdminUsers(search);
  const recordView = useMutation(api.admin.recordUserView);
  const [selected, setSelected] = useState<Id<"users"> | null>(null);
  const filtered = users;
  if (usersStatus === "LoadingFirstPage") return <LoadingBlock />;
  const openUser = (userId: Id<"users">) => {
    setSelected(userId);
    void recordView({ subjectUserId: userId });
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-b p-4">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t("admin.users.search")}
          />
        </div>
        <div className="divide-y">
          {filtered.map((item) => (
            <button
              type="button"
              key={item.user.userId}
              onClick={() => openUser(item.user.userId)}
              className={cn(
                "hover:bg-muted/40 grid w-full gap-3 px-5 py-4 text-start transition-colors sm:grid-cols-[1fr_auto_auto] sm:items-center",
                selected === item.user.userId && "bg-blue-500/5",
              )}
            >
              <div>
                <p className="text-sm font-medium">
                  {displayUser(item.user)}{" "}
                  {item.isAdmin ? (
                    <ShieldCheck className="ms-1 inline size-3.5 text-blue-600" />
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {item.user.email ?? "—"}
                </p>
              </div>
              <div className="text-xs sm:text-end">
                <p className="font-semibold">
                  {t("admin.users.savedCount", { count: item.savedJobs })}
                </p>
                <p className="text-muted-foreground">
                  {t("admin.users.jobCount", { count: item.indexedMatches })}
                </p>
              </div>
              <div className="text-muted-foreground text-xs sm:min-w-32 sm:text-end">
                <p>{t("admin.users.lastSeen")}</p>
                <p className="text-foreground font-medium">
                  {formatDateTime(item.lastSeenAt, i18n.language)}
                </p>
              </div>
            </button>
          ))}
          {!filtered.length &&
          (!search.trim() || usersStatus === "Exhausted") ? (
            <EmptyBlock>{t("admin.users.noResults")}</EmptyBlock>
          ) : null}
        </div>
        <UsersLoadMore status={usersStatus} loadMore={loadMoreUsers} />
      </section>
      <aside className="border-border bg-card h-fit rounded-2xl border p-5 shadow-sm xl:sticky xl:top-6">
        {selected ? (
          <UserInsight userId={selected} onClose={() => setSelected(null)} />
        ) : (
          <EmptyBlock>{t("admin.users.selectUser")}</EmptyBlock>
        )}
      </aside>
    </div>
  );
}

function useAdminJobs(search: string) {
  const term = search.trim().replace(/\s+/gu, " ").slice(0, 100);
  const recentJobs = useQuery(api.admin.listJobs, term ? "skip" : {});
  const titleMatches = usePaginatedQuery(
    api.admin.searchJobs,
    term ? { search: term, field: "title" } : "skip",
    { initialNumItems: 25 },
  );
  const companyMatches = usePaginatedQuery(
    api.admin.searchJobs,
    term ? { search: term, field: "companyName" } : "skip",
    { initialNumItems: 25 },
  );
  const jobs = useMemo(() => {
    if (!term) return recentJobs;
    const byId = new Map(
      [...titleMatches.results, ...companyMatches.results].map((job) => [
        job.jobId,
        job,
      ]),
    );
    const normalizedTerm = term.toLocaleLowerCase();
    const exactMatch = (job: { title: string; companyName: string }) =>
      job.title.toLocaleLowerCase().includes(normalizedTerm) ||
      job.companyName.toLocaleLowerCase().includes(normalizedTerm);
    return [...byId.values()].sort(
      (left, right) =>
        Number(exactMatch(right)) - Number(exactMatch(left)) ||
        right.firstDiscoveredAt - left.firstDiscoveredAt,
    );
  }, [term, recentJobs, titleMatches.results, companyMatches.results]);
  const loading = term
    ? titleMatches.status === "LoadingFirstPage" ||
      companyMatches.status === "LoadingFirstPage"
    : recentJobs === undefined;
  const hasMore =
    term &&
    (titleMatches.status === "CanLoadMore" ||
      companyMatches.status === "CanLoadMore");
  const loadMore = () => {
    if (titleMatches.status === "CanLoadMore") titleMatches.loadMore(25);
    if (companyMatches.status === "CanLoadMore") companyMatches.loadMore(25);
  };
  return { jobs, loading, hasMore, loadMore };
}

function JobsSection() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const { jobs, loading, hasMore, loadMore } = useAdminJobs(search);
  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-b p-4">
        <SearchField
          value={search}
          onChange={(value) => setSearch(value.slice(0, 100))}
          placeholder={t("admin.jobs.search")}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th className="px-5 py-3 text-start font-medium">
                {t("admin.columns.job")}
              </th>
              <th className="px-4 py-3 text-start font-medium">
                {t("admin.columns.status")}
              </th>
              <th className="px-4 py-3 text-start font-medium">
                {t("admin.columns.firstSeen")}
              </th>
              <th className="px-5 py-3 text-end font-medium">
                {t("admin.columns.source")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading &&
              jobs?.map((job) => (
                <tr key={job.jobId}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{job.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {job.companyName}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("admin.diagnostics.experience")}:{" "}
                      {experienceRequirement(
                        job.requiredExperienceYearsMin,
                        job.requiredExperienceYearsMax,
                        t("admin.diagnostics.unknown"),
                      )}
                      {job.locationText ? ` · ${job.locationText}` : ""}
                    </p>
                    {job.requiredSkills.length ? (
                      <p className="text-muted-foreground mt-1 max-w-xl truncate text-xs">
                        {job.requiredSkills.join(" · ")}
                      </p>
                    ) : null}
                    <JobDiagnosticDisclosure jobId={job.jobId} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={job.lifecycleStatus} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {formatDateTime(job.firstDiscoveredAt, i18n.language)}
                  </td>
                  <td className="px-5 py-3 text-end">
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {t("admin.jobs.openSource")}
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {loading ? <LoadingBlock /> : null}
        {!loading && !jobs?.length ? (
          <EmptyBlock>{t("admin.jobs.noResults")}</EmptyBlock>
        ) : null}
        {!loading && hasMore ? (
          <div className="border-t p-4 text-center">
            <Button variant="outline" onClick={loadMore}>
              {t("admin.jobs.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Inspector() {
  const { t } = useTranslation();
  const [userSearch, setUserSearch] = useState("");
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const {
    results: users,
    status: usersStatus,
    loadMore: loadMoreUsers,
  } = useAdminUsers(userId ? "" : userSearch);
  const [jobSearch, setJobSearch] = useState("");
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const {
    jobs,
    loading: jobsLoading,
    hasMore,
    loadMore,
  } = useAdminJobs(jobId ? "" : jobSearch);
  const [evaluationNow, setEvaluationNow] = useState(() => Date.now());
  const explanation = useQuery(
    api.admin.explainUserJob,
    userId && jobId ? { userId, jobId, now: evaluationNow } : "skip",
  );
  if (usersStatus === "LoadingFirstPage") return <LoadingBlock />;
  const userOptions = users
    .filter(({ user }) =>
      `${user.name ?? ""} ${user.email ?? ""}`
        .toLocaleLowerCase()
        .includes(userSearch.toLocaleLowerCase()),
    )
    .slice(0, 8);
  const jobOptions = jobs ?? [];
  return (
    <div className="space-y-6">
      <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">
              {t("admin.inspector.user")}
            </label>
            <div className="mt-2">
              <SearchField
                value={userSearch}
                onChange={(value) => {
                  setUserSearch(value);
                  setUserId(null);
                }}
                placeholder={t("admin.inspector.userPlaceholder")}
              />
            </div>
            {userSearch && !userId ? (
              <div className="mt-2 overflow-hidden rounded-xl border">
                {userOptions.map(({ user }) => (
                  <button
                    type="button"
                    key={user.userId}
                    onClick={() => {
                      setUserId(user.userId);
                      setUserSearch(displayUser(user));
                      setEvaluationNow(Date.now());
                    }}
                    className="hover:bg-muted block w-full border-b px-3 py-2 text-start text-sm last:border-0"
                  >
                    <span className="font-medium">{displayUser(user)}</span>
                    <span className="text-muted-foreground ms-2 text-xs">
                      {user.email}
                    </span>
                  </button>
                ))}
                <UsersLoadMore status={usersStatus} loadMore={loadMoreUsers} />
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-semibold">
              {t("admin.inspector.job")}
            </label>
            <div className="mt-2">
              <SearchField
                value={jobSearch}
                onChange={(value) => {
                  setJobSearch(value.slice(0, 100));
                  setJobId(null);
                }}
                placeholder={t("admin.inspector.jobPlaceholder")}
              />
            </div>
            {jobSearch && !jobId ? (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border">
                {jobsLoading ? <LoadingBlock /> : null}
                {!jobsLoading &&
                  jobOptions.map((job) => (
                    <button
                      type="button"
                      key={job.jobId}
                      onClick={() => {
                        setJobId(job.jobId);
                        setJobSearch(`${job.title} · ${job.companyName}`);
                        setEvaluationNow(Date.now());
                      }}
                      className="hover:bg-muted block w-full border-b px-3 py-2 text-start text-sm last:border-0"
                    >
                      <span className="font-medium">{job.title}</span>
                      <span className="text-muted-foreground ms-2 text-xs">
                        {job.companyName}
                      </span>
                    </button>
                  ))}
                {!jobsLoading && hasMore ? (
                  <button
                    type="button"
                    onClick={loadMore}
                    className="hover:bg-muted w-full px-3 py-2 text-start text-sm"
                  >
                    {t("admin.jobs.loadMore")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
      {!userId || !jobId ? (
        <section className="border-border bg-card rounded-2xl border shadow-sm">
          <EmptyBlock>{t("admin.inspector.selectBoth")}</EmptyBlock>
        </section>
      ) : !explanation ? (
        <LoadingBlock />
      ) : explanation ? (
        <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {explanation.visible ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <CircleX className="size-5 text-rose-600" />
                )}
                <h2 className="text-lg font-semibold">
                  {explanation.visible
                    ? t("admin.inspector.visible")
                    : t("admin.inspector.hidden")}
                </h2>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {explanation.headline}
              </p>
            </div>
            {explanation.relevanceScore !== null ? (
              <div className="text-end">
                <p className="text-3xl font-semibold tabular-nums">
                  {explanation.relevanceScore}
                </p>
                <p className="text-muted-foreground text-xs">
                  {explanation.matchQuality}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {explanation.checks.map((check) => (
              <div
                key={check.key}
                className={cn(
                  "rounded-xl border p-4",
                  check.passed
                    ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20"
                    : "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/20",
                )}
              >
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <CircleX className="size-4 text-rose-600" />
                  )}
                  <p className="text-sm font-semibold">
                    {check.key === "experience"
                      ? t("admin.diagnostics.experience")
                      : check.key.replaceAll("_", " ")}
                  </p>
                </div>
                <p className="text-muted-foreground mt-2 text-xs leading-5">
                  {check.key === "experience"
                    ? t("admin.diagnostics.experienceComparison", {
                        candidate:
                          explanation.experience.candidateYears ??
                          t("admin.diagnostics.unknown"),
                        required: experienceRequirement(
                          explanation.experience.resolvedMin,
                          explanation.experience.resolvedMax,
                          t("admin.diagnostics.unknown"),
                        ),
                      })
                    : check.detail}
                </p>
              </div>
            ))}
          </div>
          {explanation.profileEvidence ? (
            <div className="bg-muted/50 mt-6 rounded-xl p-4">
              <h3 className="text-sm font-semibold">
                {t("admin.diagnostics.profileEvidence")}
              </h3>
              <div className="text-muted-foreground mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <p>
                  {t("admin.diagnostics.candidateExperience")}:{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {explanation.profileEvidence.yearsOfExperience}
                  </span>
                </p>
                <p>
                  {t("admin.diagnostics.seniority")}:{" "}
                  <span className="text-foreground font-semibold">
                    {explanation.profileEvidence.seniority ??
                      t("admin.diagnostics.unknown")}
                  </span>
                </p>
                <p className="sm:col-span-2">
                  {t("admin.diagnostics.targetRoles")}:{" "}
                  <span className="text-foreground">
                    {explanation.profileEvidence.targetJobTitles.join(" · ")}
                  </span>
                </p>
                <p className="sm:col-span-2">
                  {t("admin.diagnostics.profileSkills")}:{" "}
                  <span className="text-foreground">
                    {explanation.profileEvidence.skills.join(" · ") ||
                      t("admin.diagnostics.unknown")}
                  </span>
                </p>
              </div>
            </div>
          ) : null}
          <JobDiagnosticDisclosure jobId={jobId} defaultOpen />
        </section>
      ) : (
        <EmptyBlock>{t("admin.inspector.notFound")}</EmptyBlock>
      )}
    </div>
  );
}

function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const access = useQuery(api.admin.getAccess);
  const [section, setSection] = useState<Section>("overview");
  const [dateKey, setDateKey] = useState(() => israelDateKey());
  if (!access) return <LoadingBlock />;
  if (!access.isAdmin)
    return (
      <div className="bg-brand-snow grid min-h-svh place-items-center p-6">
        <div className="bg-card border-border max-w-md rounded-3xl border p-8 text-center shadow-lg">
          <ShieldCheck className="text-muted-foreground mx-auto size-10" />
          <h1 className="mt-5 text-xl font-semibold">
            {t("admin.access.title")}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t("admin.access.description")}
          </p>
          <Button className="mt-6" render={<Link href="/" />}>
            <ArrowLeft />
            {t("admin.actions.back")}
          </Button>
        </div>
      </div>
    );
  const items: Array<{ id: Section; label: string; icon: LucideIcon }> = [
    { id: "overview", label: t("admin.nav.overview"), icon: Gauge },
    { id: "users", label: t("admin.nav.users"), icon: Users },
    { id: "searches", label: t("admin.nav.searches"), icon: Search },
    { id: "tokenUsage", label: t("admin.nav.tokenUsage"), icon: Coins },
    { id: "jobs", label: t("admin.nav.jobs"), icon: BriefcaseBusiness },
    { id: "catalog", label: t("admin.nav.catalog"), icon: Sparkles },
    { id: "inspector", label: t("admin.nav.inspector"), icon: Eye },
  ];
  return (
    <div className="bg-brand-snow min-h-svh text-start">
      <header className="bg-brand-midnight sticky top-0 z-30 border-b border-white/10 text-white">
        <div className="mx-auto flex min-h-16 max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6">
          <Brand inverse />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/60 sm:block">
              {access.user ? displayUser(access.user) : null}
            </span>
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t("admin.actions.exit")}
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[96rem] md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-border bg-card border-b p-3 md:sticky md:top-16 md:h-[calc(100svh-4rem)] md:border-e md:border-b-0 md:p-4">
          <nav
            aria-label={t("admin.navigation")}
            className="flex gap-1 overflow-x-auto md:flex-col"
          >
            {items.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  section === id
                    ? "bg-brand-midnight text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-brand-electric text-xs font-semibold tracking-[0.16em] uppercase">
                {t("admin.eyebrow")}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {items.find((item) => item.id === section)?.label}
              </h1>
            </div>
            {section === "overview" ||
            section === "searches" ||
            section === "tokenUsage" ? (
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <CalendarDays className="size-4" />
                <input
                  type="date"
                  value={dateKey}
                  max={israelDateKey()}
                  onChange={(event) => setDateKey(event.target.value)}
                  className="border-input bg-background text-foreground h-10 rounded-xl border px-3 text-sm outline-none focus:ring-3 focus:ring-blue-500/20"
                />
              </label>
            ) : null}
          </div>
          <LazyMotion features={domAnimation}>
            <m.div
              key={section}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {section === "overview" ? (
                <Overview dateKey={dateKey} />
              ) : section === "users" ? (
                <UsersSection />
              ) : section === "searches" ? (
                <Searches dateKey={dateKey} />
              ) : section === "tokenUsage" ? (
                <TokenUsage dateKey={dateKey} />
              ) : section === "jobs" ? (
                <JobsSection />
              ) : section === "catalog" ? (
                <CatalogReview />
              ) : (
                <Inspector />
              )}
            </m.div>
          </LazyMotion>
          <p className="text-muted-foreground mt-8 text-xs">
            {t("admin.timezone", { language: i18n.language })}
          </p>
        </main>
      </div>
    </div>
  );
}

export function AdminRoute() {
  return (
    <AuthBoundary unauthenticated={<SignInScreen />}>
      <AdminDashboard />
    </AuthBoundary>
  );
}

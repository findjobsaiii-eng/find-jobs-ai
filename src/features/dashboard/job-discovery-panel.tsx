import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LocalizedDate } from "@/components/ui/localized-date";
import { useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CircleOff,
  ExternalLink,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { JobmiterMark } from "@/components/ui/jobmiter-logo";
import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import * as m from "motion/react-m";
import { api } from "../../../convex/_generated/api";
import { JobDeepReview } from "./job-deep-review";
import { JobMatchScore } from "./job-match-score";
import { ApplicationTimeline } from "./application-timeline";
import { ApplicationTrackingActions } from "./application-tracking-actions";
import {
  applicationStatusesInUse,
  type ApplicationFilter,
  type ApplicationStatus,
} from "./application-status";
import { ApplicationStatusFilters } from "./application-status-filters";

export function JobDiscoveryPanel({
  view,
  onEdit,
}: {
  view: "suggestions" | "inProgress";
  onEdit?: () => void;
}) {
  const { i18n, t } = useTranslation();
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<{ key: string } | null>(null);
  const [filter, setFilter] = useState<ApplicationFilter>("all");
  const result = useQuery(api.jobDiscovery.listCurrentUserJobs, { view });

  const jobs = result?.jobs ?? [];
  const availableStatuses = applicationStatusesInUse(
    jobs.map((job) => job.trackingStatus as ApplicationStatus | undefined),
  );
  const statusCounts = new Map<ApplicationStatus, number>();
  for (const job of jobs) {
    if (!job.trackingStatus) continue;
    const status = job.trackingStatus as ApplicationStatus;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const activeFilter =
    filter === "all" || availableStatuses.includes(filter) ? filter : "all";
  const visibleJobs =
    view === "inProgress" && activeFilter !== "all"
      ? jobs.filter((job) => job.trackingStatus === activeFilter)
      : jobs;
  const plan = result?.plan ?? "free";
  const emptyReason =
    view === "suggestions" ? result?.emptyState?.reason : undefined;
  const discoveryPending =
    view === "suggestions" &&
    (result?.discoveryState === "pending" ||
      result?.discoveryState === "running");

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return (
    <LazyMotion features={domAnimation}>
      <section aria-label={t("dashboard.jobsTitle")} className="min-w-0">
        <AnimatePresence>
          {notice ? (
            <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
              <m.p
                role="status"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="bg-foreground text-background rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
              >
                {t(`applications.${notice.key}`)}
              </m.p>
            </div>
          ) : null}
        </AnimatePresence>
        <div>
          {error ? (
            <p role="alert" className="text-destructive mb-4 text-sm">
              {t("applications.error")}
            </p>
          ) : null}
          <AnimatePresence initial={false} mode="wait">
            {result === undefined ? (
              <m.div
                key="loading"
                exit={{ opacity: 0 }}
                className="bg-card border-border flex min-h-80 items-center justify-center rounded-3xl border shadow-[var(--brand-shadow-card)]"
              >
                <span className="relative grid size-20 place-items-center">
                  <span
                    aria-hidden="true"
                    className="border-t-brand-electric absolute inset-0 rounded-full border border-transparent motion-safe:animate-spin motion-reduce:animate-none"
                  />
                  <JobmiterMark className="size-11" />
                </span>
                <span className="sr-only">{t("jobDiscovery.loading")}</span>
              </m.div>
            ) : jobs.length === 0 ? (
              <m.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-card border-border relative flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-3xl border px-6 py-14 text-center shadow-[var(--brand-shadow-card)]"
              >
                {discoveryPending ? (
                  <div
                    aria-hidden="true"
                    className="bg-brand-electric/8 absolute inset-x-16 top-8 h-48 rounded-full blur-3xl"
                  />
                ) : null}
                <span className="bg-brand-midnight relative mb-6 grid size-24 place-items-center rounded-full text-white shadow-[var(--brand-shadow-card)]">
                  {discoveryPending ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="border-brand-electric/20 absolute -inset-3 rounded-full border motion-safe:animate-ping"
                      />
                      <span
                        aria-hidden="true"
                        className="border-brand-teal/35 absolute inset-2 rounded-full border motion-safe:animate-pulse"
                      />
                      <span
                        aria-hidden="true"
                        className="border-t-brand-electric absolute inset-1 rounded-full border border-transparent motion-safe:animate-spin motion-reduce:animate-none"
                      />
                      <Search
                        aria-hidden="true"
                        className="text-brand-snow relative size-7"
                      />
                      <Sparkles
                        aria-hidden="true"
                        className="text-brand-teal absolute end-3 top-3 size-4 motion-safe:animate-pulse"
                      />
                    </>
                  ) : (
                    <BriefcaseBusiness aria-hidden="true" className="size-7" />
                  )}
                </span>
                <h2 className="text-xl font-semibold text-balance">
                  {t(
                    view === "inProgress"
                      ? "applications.emptyTitle"
                      : discoveryPending
                        ? "jobDiscovery.pendingTitle"
                        : emptyReason === "location"
                          ? "jobDiscovery.locationEmptyTitle"
                          : emptyReason === "no_active_jobs"
                            ? "jobDiscovery.noActiveEmptyTitle"
                            : "jobDiscovery.emptyTitle",
                  )}
                </h2>
                <p className="text-muted-foreground mt-3 max-w-md text-sm leading-7 text-pretty">
                  {t(
                    view === "inProgress"
                      ? "applications.emptyDescription"
                      : discoveryPending
                        ? "jobDiscovery.pendingDescription"
                        : emptyReason === "location"
                          ? "jobDiscovery.locationEmptyDescription"
                          : emptyReason === "no_active_jobs"
                            ? "jobDiscovery.noActiveEmptyDescription"
                            : "jobDiscovery.emptyDescription",
                    emptyReason === "location"
                      ? { radius: result?.emptyState?.radiusKm }
                      : undefined,
                  )}
                </p>
                {emptyReason === "location" &&
                result?.emptyState?.outsideRadiusCount ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t("jobDiscovery.outsideRadiusCount", {
                      count: result.emptyState.outsideRadiusCount,
                    })}
                  </p>
                ) : null}
                {emptyReason === "location" && onEdit ? (
                  <Button className="mt-5" onClick={onEdit}>
                    {t("jobDiscovery.expandSearchRadius")}
                  </Button>
                ) : null}
              </m.div>
            ) : (
              <m.div
                key="results"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                {view === "inProgress" ? (
                  <ApplicationStatusFilters
                    statuses={availableStatuses}
                    counts={statusCounts}
                    value={activeFilter}
                    total={jobs.length}
                    onChange={setFilter}
                  />
                ) : null}
                {visibleJobs.length ? (
                  <m.ul className="space-y-3">
                    <AnimatePresence initial={false} propagate>
                      {visibleJobs.map((job) => {
                        const trackingStatus = job.trackingStatus as
                          ApplicationStatus | undefined;
                        const displayLocation = job.locationNames
                          ? i18n.resolvedLanguage?.startsWith("he")
                            ? job.locationNames.he
                            : job.locationNames.en
                          : job.workArrangement === "remote"
                            ? t("jobDiscovery.remoteLocation")
                            : job.locationText;
                        const postedTimestamp = job.postedAt
                          ? Date.parse(job.postedAt)
                          : Number.NaN;
                        const hasPostedDate = Number.isFinite(postedTimestamp);
                        const visibleDate = hasPostedDate
                          ? postedTimestamp
                          : job.discoveredAt;
                        const publishedAge = (() => {
                          if (!hasPostedDate) return null;
                          const days =
                            job.postedAgeDays ??
                            Math.max(
                              0,
                              Math.floor(
                                (Date.now() - postedTimestamp) /
                                  (24 * 60 * 60 * 1_000),
                              ),
                            );
                          if (days === 0) return t("jobDiscovery.age.today");
                          if (days === 1)
                            return t("jobDiscovery.age.days", { count: days });
                          if (days < 7)
                            return t("jobDiscovery.age.days", { count: days });
                          if (days < 14)
                            return t("jobDiscovery.age.week", { count: 1 });
                          if (days < 30)
                            return t("jobDiscovery.age.weeks", {
                              count: Math.floor(days / 7),
                            });
                          if (days < 60)
                            return t("jobDiscovery.age.month", { count: 1 });
                          return t("jobDiscovery.age.months", {
                            count: Math.floor(days / 30),
                          });
                        })();
                        const skills = (job.requiredSkills ?? []).slice(0, 5);
                        const highlights = job.matchHighlights;
                        const matchQuality =
                          job.matchQuality ??
                          (job.relevanceScore >= 58
                            ? "strong"
                            : job.relevanceScore >= 45
                              ? "partial"
                              : "possible");
                        const explanations = [
                          ...(view === "suggestions" &&
                          matchQuality !== "strong"
                            ? [t(`jobDiscovery.match.${matchQuality}Context`)]
                            : []),
                          ...(highlights?.skills.length
                            ? [
                                t("jobDiscovery.match.skills", {
                                  skills: highlights.skills
                                    .slice(0, 2)
                                    .join(" · "),
                                }),
                              ]
                            : []),
                          ...(highlights?.targetRole
                            ? [
                                t("jobDiscovery.match.targetRole", {
                                  role: highlights.targetRole,
                                }),
                              ]
                            : highlights?.pastRole
                              ? [t("jobDiscovery.match.pastRole")]
                              : []),
                          ...(highlights?.domain
                            ? [
                                t("jobDiscovery.match.domain", {
                                  domain: highlights.domain,
                                }),
                              ]
                            : []),
                          ...(highlights?.location
                            ? [t("jobDiscovery.match.location")]
                            : []),
                        ].slice(0, 3);
                        return (
                          <m.li
                            key={job.id}
                            exit={{ opacity: 0, y: -10, scale: 0.985 }}
                            transition={{ duration: 0.45, ease: "easeOut" }}
                          >
                            <article
                              className={`bg-card isolate overflow-hidden rounded-3xl border p-5 shadow-[var(--brand-shadow-card)] transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none sm:p-6 ${
                                job.unavailable
                                  ? "border-destructive/25"
                                  : trackingStatus === "saved"
                                    ? "border-primary/35 hover:border-primary/55 hover:shadow-[var(--brand-shadow-card-hover)]"
                                    : "border-border hover:border-primary/25 hover:shadow-[var(--brand-shadow-card-hover)]"
                              }`}
                            >
                              {job.unavailable ? (
                                <p className="text-destructive mb-4 flex items-center gap-2 text-sm font-medium">
                                  <CircleOff
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                  {t("jobDiscovery.noLongerActive")}
                                </p>
                              ) : null}
                              <div className="flex items-start gap-3.5">
                                <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
                                  <BriefcaseBusiness
                                    aria-hidden="true"
                                    className="size-5"
                                  />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <h2 className="text-foreground text-lg leading-6 font-semibold break-words sm:text-xl">
                                    {job.title}
                                  </h2>
                                  <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-sm font-medium break-words">
                                    <Building2
                                      aria-hidden="true"
                                      className="size-4 shrink-0"
                                    />
                                    {job.companyName}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {view === "suggestions" ? (
                                    <JobMatchScore
                                      score={job.relevanceScore}
                                      quality={matchQuality}
                                      components={job.scoreComponents}
                                      highlights={job.matchHighlights}
                                    />
                                  ) : null}
                                </div>
                              </div>

                              <dl className="text-muted-foreground mt-4 flex flex-wrap gap-2 text-sm">
                                {displayLocation ? (
                                  <div className="bg-muted/70 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                                    <MapPin
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                    <dt className="sr-only">
                                      {t("jobDiscovery.location")}
                                    </dt>
                                    <dd>{displayLocation}</dd>
                                  </div>
                                ) : null}
                                {job.workArrangement !== "unknown" ? (
                                  <div className="bg-muted/70 rounded-lg px-2.5 py-1.5">
                                    <dt className="sr-only">
                                      {t("jobDiscovery.arrangement")}
                                    </dt>
                                    <dd>
                                      {t(
                                        `onboarding.options.workArrangement.${job.workArrangement}`,
                                      )}
                                    </dd>
                                  </div>
                                ) : null}
                                {view === "suggestions" && publishedAge ? (
                                  <div className="bg-muted/70 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                                    <CalendarDays
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                    <dt className="sr-only">
                                      {t("jobDiscovery.posted")}
                                    </dt>
                                    <dd>
                                      <time
                                        dateTime={new Date(
                                          postedTimestamp,
                                        ).toISOString()}
                                      >
                                        {publishedAge}
                                      </time>
                                    </dd>
                                  </div>
                                ) : view === "inProgress" ? (
                                  <div className="bg-muted/70 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                                    <CalendarDays
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                    <dt className="sr-only">
                                      {t(
                                        hasPostedDate
                                          ? "jobDiscovery.posted"
                                          : "jobDiscovery.discovered",
                                      )}
                                    </dt>
                                    <dd>
                                      <LocalizedDate value={visibleDate}>
                                        {(date) =>
                                          t(
                                            hasPostedDate
                                              ? "jobDiscovery.postedAt"
                                              : "jobDiscovery.discoveredAt",
                                            { date },
                                          )
                                        }
                                      </LocalizedDate>
                                    </dd>
                                  </div>
                                ) : null}
                              </dl>

                              {job.descriptionText ? (
                                <p className="text-foreground/80 mt-4 line-clamp-3 text-sm leading-6 text-pretty">
                                  {job.descriptionText}
                                </p>
                              ) : null}

                              {view === "suggestions" && explanations.length ? (
                                <ul
                                  aria-label={t("jobDiscovery.match.heading")}
                                  className="text-primary mt-4 space-y-1.5 text-sm"
                                >
                                  {explanations.map((explanation) => (
                                    <li
                                      key={explanation}
                                      className="flex items-start gap-2"
                                    >
                                      <Check
                                        aria-hidden="true"
                                        className="mt-1 size-3.5 shrink-0"
                                      />
                                      <span>{explanation}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}

                              {skills.length ? (
                                <div className="mt-4">
                                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                    {t("jobDiscovery.keySkills")}
                                  </h3>
                                  <ul className="mt-2 flex flex-wrap gap-2">
                                    {skills.map((skill) => (
                                      <li
                                        key={skill}
                                        className="border-border text-foreground/80 rounded-full border px-2.5 py-1 text-xs"
                                      >
                                        {skill}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              <ApplicationTimeline
                                events={job.trackingTimeline}
                              />

                              <JobDeepReview
                                jobId={job.id}
                                unavailable={Boolean(job.unavailable)}
                                plan={plan}
                                review={job.deepReview}
                              />

                              <div className="border-border mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                                <span className="text-muted-foreground text-xs">
                                  {t("jobDiscovery.source", {
                                    source:
                                      job.sourceName ??
                                      new URL(job.sourceUrl).hostname,
                                  })}
                                  {" · "}
                                  {t(
                                    `jobDiscovery.sourceTiers.${job.sourceTier}`,
                                  )}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  <ApplicationTrackingActions
                                    jobId={job.id}
                                    inSuggestions={view === "suggestions"}
                                    status={trackingStatus}
                                    onChanged={(nextNotice) => {
                                      setError(false);
                                      setNotice({ key: nextNotice });
                                    }}
                                    onRemoveError={() => {
                                      setNotice(null);
                                      setError(true);
                                    }}
                                  />
                                  <a
                                    href={job.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/40 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none"
                                  >
                                    {t("jobDiscovery.openPosting")}
                                    <ExternalLink
                                      aria-hidden="true"
                                      className="size-4"
                                    />
                                  </a>
                                </div>
                              </div>
                            </article>
                          </m.li>
                        );
                      })}
                    </AnimatePresence>
                  </m.ul>
                ) : null}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </LazyMotion>
  );
}

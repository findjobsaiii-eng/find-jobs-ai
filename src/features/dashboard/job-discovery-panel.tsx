import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LocalizedDate } from "@/components/ui/localized-date";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CircleOff,
  ExternalLink,
  LoaderCircle,
  MapPin,
  NotebookPen,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { JobDeepReview } from "./job-deep-review";
import { JobMatchScore } from "./job-match-score";
import { ApplicationTrackerDialog } from "./application-tracker-dialog";
import { ApplicationStatusPicker } from "./application-status-picker";
import {
  APPLICATION_FILTERS,
  matchesApplicationFilter,
  type ApplicationFilter,
  type ApplicationStatus,
} from "./application-status";

export function JobDiscoveryPanel({
  view,
  onEdit,
}: {
  view: "suggestions" | "inProgress";
  onEdit?: () => void;
}) {
  const { i18n, t } = useTranslation();
  const [pending, setPending] = useState<Id<"jobs"> | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApplicationFilter>("all");
  const updateApplication = useMutation(api.jobDiscovery.setApplicationStatus);
  const updateTracking = useMutation(api.jobDiscovery.updateJobTracking);
  const result = useQuery(api.jobDiscovery.listCurrentUserJobs, { view });

  const markApplied = async (jobId: Id<"jobs">, applied: boolean) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(jobId);
    setError(false);
    setNotice(null);
    try {
      await updateApplication({ jobId, applied });
      setNotice(applied ? "appliedMarked" : "unmarked");
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };

  const saveWithStatus = async (
    jobId: Id<"jobs">,
    status: ApplicationStatus,
  ) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(jobId);
    setError(false);
    setNotice(null);
    try {
      await updateTracking({ jobId, status });
      setNotice(status === "saved" ? "marked" : "trackingSaved");
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };

  const jobs = result?.jobs ?? [];
  const visibleJobs =
    view === "inProgress" && filter !== "all"
      ? jobs.filter((job) =>
          matchesApplicationFilter(
            (job.trackingStatus ?? "applied") as ApplicationStatus,
            filter,
          ),
        )
      : jobs;
  const plan = result?.plan ?? "free";
  const emptyReason =
    view === "suggestions" ? result?.emptyState?.reason : undefined;
  const discoveryPending =
    view === "suggestions" &&
    (result?.discoveryState === "pending" ||
      result?.discoveryState === "running");
  return (
    <section aria-label={t("dashboard.jobsTitle")} className="min-w-0">
      <div>
        {notice ? (
          <p role="status" className="text-primary mb-4 text-sm">
            {t(`applications.${notice}`)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive mb-4 text-sm">
            {t("applications.error")}
          </p>
        ) : null}
        {result === undefined ? (
          <div className="bg-card border-border flex min-h-80 items-center justify-center rounded-3xl border shadow-[var(--brand-shadow-card)]">
            <LoaderCircle
              aria-hidden="true"
              className="text-primary size-7 animate-spin"
            />
            <span className="sr-only">{t("jobDiscovery.loading")}</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-card border-border relative flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-3xl border px-6 py-14 text-center shadow-[var(--brand-shadow-card)]">
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
          </div>
        ) : (
          <>
            {view === "inProgress" ? (
              <div
                className="mb-4 flex flex-wrap gap-1.5"
                aria-label={t("applications.filters.label")}
              >
                {APPLICATION_FILTERS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={filter === value ? "default" : "ghost"}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {t(`applications.filters.${value}`)}
                  </Button>
                ))}
              </div>
            ) : null}
            {visibleJobs.length === 0 ? (
              <div className="bg-card border-border rounded-2xl border px-6 py-10 text-center shadow-sm">
                <p className="text-muted-foreground text-sm text-pretty">
                  {t("applications.filters.empty")}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
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
                    ...(view === "suggestions" && matchQuality !== "strong"
                      ? [t(`jobDiscovery.match.${matchQuality}Context`)]
                      : []),
                    ...(highlights?.skills.length
                      ? [
                          t("jobDiscovery.match.skills", {
                            skills: highlights.skills.slice(0, 2).join(" · "),
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
                    <li key={job.id}>
                      <article
                        className={`bg-card rounded-3xl border p-5 shadow-[var(--brand-shadow-card)] transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transition-none sm:p-6 ${
                          job.unavailable
                            ? "border-destructive/25"
                            : trackingStatus === "saved"
                              ? "border-primary/35 hover:border-primary/55 hover:-translate-y-0.5 hover:shadow-[var(--brand-shadow-card-hover)]"
                              : "border-border hover:border-primary/25 hover:-translate-y-0.5 hover:shadow-[var(--brand-shadow-card-hover)]"
                        }`}
                      >
                        {job.unavailable ? (
                          <p className="text-destructive mb-4 flex items-center gap-2 text-sm font-medium">
                            <CircleOff aria-hidden="true" className="size-4" />
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

                        {view === "inProgress" ? (
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
                              {t(
                                `applications.status.${trackingStatus ?? "applied"}`,
                              )}
                            </span>
                            {job.trackingUpdatedAt ? (
                              <span className="text-muted-foreground text-xs">
                                <LocalizedDate value={job.trackingUpdatedAt}>
                                  {(date) =>
                                    t("applications.lastUpdated", { date })
                                  }
                                </LocalizedDate>
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <dl className="text-muted-foreground mt-4 flex flex-wrap gap-2 text-sm">
                          {displayLocation ? (
                            <div className="bg-muted/70 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                              <MapPin aria-hidden="true" className="size-3.5" />
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

                        {job.appliedAt ? (
                          <p className="text-primary mt-4 text-sm">
                            <LocalizedDate value={job.appliedAt}>
                              {(date) => t("applications.sentAt", { date })}
                            </LocalizedDate>
                          </p>
                        ) : null}

                        {view === "inProgress" && job.trackingNotes ? (
                          <p className="bg-muted/60 text-foreground/80 mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm leading-6 text-pretty">
                            <NotebookPen
                              aria-hidden="true"
                              className="text-muted-foreground mt-1 size-4 shrink-0"
                            />
                            <span className="line-clamp-2">
                              {job.trackingNotes}
                            </span>
                          </p>
                        ) : null}

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
                            {t(`jobDiscovery.sourceTiers.${job.sourceTier}`)}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {view === "inProgress" ? (
                              <ApplicationTrackerDialog
                                jobId={job.id}
                                jobTitle={job.title}
                                status={trackingStatus}
                                onSaved={() => setNotice("trackingSaved")}
                              />
                            ) : null}
                            {view === "suggestions" ? (
                              <ApplicationStatusPicker
                                status={trackingStatus}
                                disabled={pending !== null}
                                onSelect={(status) =>
                                  saveWithStatus(job.id, status)
                                }
                              />
                            ) : (
                              <Button
                                variant="ghost"
                                className="min-h-11"
                                disabled={pending !== null}
                                onClick={() => void markApplied(job.id, false)}
                              >
                                {pending === job.id ? (
                                  <LoaderCircle
                                    aria-hidden="true"
                                    className="animate-spin"
                                  />
                                ) : null}
                                {t("applications.undo")}
                              </Button>
                            )}
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
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

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
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { JobDeepReview } from "./job-deep-review";
import { JobMatchScore } from "./job-match-score";

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
  const updateApplication = useMutation(api.jobDiscovery.setApplicationStatus);
  const result = useQuery(api.jobDiscovery.listCurrentUserJobs, { view });

  const markApplied = async (jobId: Id<"jobs">, applied: boolean) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(jobId);
    setError(false);
    setNotice(null);
    try {
      await updateApplication({ jobId, applied });
      setNotice(applied ? "marked" : "unmarked");
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };

  const jobs = result?.jobs ?? [];
  const plan = result?.plan ?? "free";
  const emptyReason =
    view === "suggestions" ? result?.emptyState?.reason : undefined;
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
          <div className="bg-card border-border flex min-h-80 items-center justify-center rounded-2xl border shadow-sm">
            <LoaderCircle
              aria-hidden="true"
              className="text-primary size-7 animate-spin"
            />
            <span className="sr-only">{t("jobDiscovery.loading")}</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-card border-border flex min-h-80 flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center shadow-sm">
            <span className="bg-primary/10 text-primary mb-5 grid size-16 place-items-center rounded-3xl">
              <BriefcaseBusiness aria-hidden="true" className="size-7" />
            </span>
            <h2 className="text-xl font-semibold">
              {t(
                view === "inProgress"
                  ? "applications.emptyTitle"
                  : emptyReason === "location"
                    ? "jobDiscovery.locationEmptyTitle"
                    : emptyReason === "no_active_jobs"
                      ? "jobDiscovery.noActiveEmptyTitle"
                      : "jobDiscovery.emptyTitle",
              )}
            </h2>
            <p className="text-muted-foreground mt-3 max-w-md text-sm leading-7">
              {t(
                view === "inProgress"
                  ? "applications.emptyDescription"
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
          <ul className="space-y-3">
            {jobs.map((job) => {
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
              const skills = (job.requiredSkills ?? []).slice(0, 5);
              const highlights = job.matchHighlights;
              const explanations = [
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
                    className={`bg-card rounded-2xl border p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transition-none sm:p-6 ${
                      job.unavailable
                        ? "border-destructive/25"
                        : "border-border hover:border-primary/25 hover:-translate-y-0.5 hover:shadow-md"
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
                      {view === "suggestions" ? (
                        <JobMatchScore
                          score={job.relevanceScore}
                          components={job.scoreComponents}
                          highlights={job.matchHighlights}
                        />
                      ) : null}
                    </div>

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
                      <div className="bg-muted/70 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                        <CalendarDays aria-hidden="true" className="size-3.5" />
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
                    </dl>

                    {job.descriptionText ? (
                      <p className="text-foreground/80 mt-4 line-clamp-3 text-sm leading-6">
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
                            job.sourceName ?? new URL(job.sourceUrl).hostname,
                        })}
                        {" · "}
                        {t(`jobDiscovery.sourceTiers.${job.sourceTier}`)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={view === "inProgress" ? "ghost" : "outline"}
                          className="min-h-11"
                          disabled={pending !== null}
                          onClick={() =>
                            void markApplied(job.id, view !== "inProgress")
                          }
                        >
                          {pending === job.id ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="animate-spin"
                            />
                          ) : null}
                          {t(
                            view === "inProgress"
                              ? "applications.undo"
                              : "applications.sentResume",
                          )}
                        </Button>
                        <a
                          href={job.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/40 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none"
                        >
                          {t("jobDiscovery.openPosting")}
                          <ExternalLink aria-hidden="true" className="size-4" />
                        </a>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

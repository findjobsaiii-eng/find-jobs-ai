import { useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

type DiscoveryError = {
  data?: { code?: string; nextAvailableAt?: number; variable?: string };
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  return (error as DiscoveryError).data?.code ?? null;
}

export function JobDiscoveryPanel({ onEdit }: { onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const result = useQuery(api.jobDiscovery.listCurrentUserJobs, {});
  const discoveryState = useQuery(
    api.jobDiscovery.getCurrentUserDiscoveryState,
    {},
  );
  const discover = useAction(
    api.jobDiscoveryActions.discoverJobsForCurrentUser,
  );
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"fresh" | "cache" | "central" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleDiscover = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    setStatus(null);
    try {
      const summary = await discover({});
      setStatus(summary.resultSource);
    } catch (cause) {
      setError(errorCode(cause) ?? "UNKNOWN");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const jobs = result?.jobs ?? [];
  const errorKey =
    error === "INCOMPLETE_SEARCH_PROFILE"
      ? "incomplete"
      : error === "SEARCH_COOLDOWN"
        ? "cooldown"
        : error === "LOCATION_RECONFIRM_REQUIRED"
          ? "locationReconfirm"
          : error === "SEARCH_QUOTA_EXCEEDED"
            ? "quota"
            : error === "JOB_SEARCH_DISABLED"
              ? "disabled"
              : error === "SEARCH_ALREADY_RUNNING"
                ? "alreadyRunning"
                : error === "OPENAI_CONFIGURATION_ERROR" ||
                    error === "JOB_SEARCH_CONFIGURATION_ERROR"
                  ? "configuration"
                  : error?.startsWith("GLOBAL_")
                    ? "globalLimit"
                    : "provider";
  const serverRunning = discoveryState?.runActive ?? false;
  const searchDisabled = discoveryState
    ? serverRunning ||
      ((!discoveryState.searchEnabled ||
        discoveryState.remainingFreshSearches === 0) &&
        !discoveryState.reuseAvailable)
    : true;
  const buttonLabel =
    running || serverRunning
      ? "jobDiscovery.running"
      : discoveryState?.reuseAvailable
        ? "jobDiscovery.reuseAvailable"
        : discoveryState && !discoveryState.searchEnabled
          ? "jobDiscovery.disabled"
          : discoveryState?.nextAvailableAt
            ? "jobDiscovery.nextAvailable"
            : discoveryState?.remainingFreshSearches === 0
              ? "jobDiscovery.quotaReached"
              : "jobDiscovery.start";
  const formatDateTime = (value: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  return (
    <section
      id="jobs"
      className="min-w-0 scroll-mt-6"
      aria-labelledby="jobs-title"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="jobs-title" className="text-xl font-bold sm:text-2xl">
            {t("dashboard.jobsTitle")}
          </h2>
          {discoveryState ? (
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>
                {t("jobDiscovery.plan", {
                  plan: t(`jobDiscovery.plans.${discoveryState.plan}`),
                })}
              </span>
              <span>
                {t("jobDiscovery.remaining", {
                  count: discoveryState.remainingFreshSearches,
                })}
              </span>
              {discoveryState.lastSuccessfulSearchAt ? (
                <span>
                  {t("jobDiscovery.lastSearch", {
                    date: formatDateTime(discoveryState.lastSuccessfulSearchAt),
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button
            onClick={() => void handleDiscover()}
            disabled={running || searchDisabled}
            className="min-h-11"
          >
            {running ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Search aria-hidden="true" />
            )}
            {t(buttonLabel)}
          </Button>
          {discoveryState?.nextAvailableAt ? (
            <time
              dateTime={new Date(discoveryState.nextAvailableAt).toISOString()}
              className="text-muted-foreground text-xs"
            >
              {t("jobDiscovery.availableAt", {
                date: formatDateTime(discoveryState.nextAvailableAt),
              })}
            </time>
          ) : null}
          {discoveryState?.plan === "free" ? (
            <span className="text-muted-foreground text-xs">
              {t("jobDiscovery.upgradeSoon")}
            </span>
          ) : null}
        </div>
      </div>
      {status ? (
        <p
          role="status"
          className="text-primary mb-4 flex items-center gap-2 text-sm"
        >
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {t(`jobDiscovery.sources.${status}`)}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 mb-4 rounded-xl border p-4 text-sm"
        >
          <p>{t(`jobDiscovery.errors.${errorKey}`)}</p>
          {errorKey === "incomplete" || errorKey === "locationReconfirm" ? (
            <Button
              variant="ghost"
              className="mt-1 h-auto p-0 underline"
              onClick={onEdit}
            >
              {t("dashboard.editProfile")}
            </Button>
          ) : errorKey === "provider" ? (
            <Button
              variant="ghost"
              className="mt-1 h-auto p-0 underline"
              onClick={() => void handleDiscover()}
            >
              {t("jobDiscovery.retry")}
            </Button>
          ) : null}
        </div>
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
            <Search aria-hidden="true" className="size-7" />
          </span>
          <h3 className="text-xl font-semibold">
            {t("jobDiscovery.emptyTitle")}
          </h3>
          <p className="text-muted-foreground mt-3 max-w-md text-sm leading-7">
            {t("jobDiscovery.emptyDescription")}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job) => {
            const salary =
              job.salaryMin === null && job.salaryMax === null
                ? null
                : t("jobDiscovery.salary", {
                    min: job.salaryMin?.toLocaleString(i18n.language) ?? "—",
                    max: job.salaryMax?.toLocaleString(i18n.language) ?? "—",
                    currency: job.salaryCurrency ?? "",
                    period: job.salaryPeriod
                      ? t(`jobDiscovery.salaryPeriods.${job.salaryPeriod}`)
                      : "",
                  });
            return (
              <li
                key={job.id}
                className="bg-card border-border rounded-2xl border p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
                    <BriefcaseBusiness aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="bg-primary/10 text-primary mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold">
                      {t("jobDiscovery.relevance", {
                        score: job.relevanceScore,
                      })}
                    </span>
                    <h3 className="text-lg font-semibold break-words">
                      {job.title}
                    </h3>
                    <p className="text-muted-foreground mt-1 break-words">
                      {job.companyName}
                    </p>
                  </div>
                </div>
                {job.matchReasons.length ? (
                  <ul className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-xs">
                    {job.matchReasons.map((reason) => (
                      <li
                        key={reason}
                        className="bg-muted rounded-full px-2.5 py-1"
                      >
                        {t(`jobDiscovery.matchReasons.${reason}`)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <dl className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {job.locationText ? (
                    <div className="flex items-center gap-2">
                      <MapPin aria-hidden="true" className="size-4" />
                      <dt className="sr-only">{t("jobDiscovery.location")}</dt>
                      <dd>{job.locationText}</dd>
                    </div>
                  ) : null}
                  {job.workArrangement !== "unknown" ? (
                    <div>
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
                  {salary ? (
                    <div>
                      <dt className="sr-only">
                        {t("jobDiscovery.salaryLabel")}
                      </dt>
                      <dd>{salary}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="sr-only">{t("jobDiscovery.verified")}</dt>
                    <dd>
                      {t("jobDiscovery.verifiedAt", {
                        date: formatDateTime(job.lastVerifiedAt),
                      })}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">
                    {t("jobDiscovery.source", {
                      source: job.sourceName ?? new URL(job.sourceUrl).hostname,
                    })}
                    {" · "}
                    {t(`jobDiscovery.sourceTiers.${job.sourceTier}`)}
                  </span>
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-border bg-background hover:bg-muted focus-visible:ring-ring/40 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3"
                  >
                    {t("jobDiscovery.openPosting")}
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

type DiscoveryError = {
  data?: { code?: string; retryAfterMs?: number; variable?: string };
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  return (error as DiscoveryError).data?.code ?? null;
}

export function JobDiscoveryPanel({ onEdit }: { onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const result = useQuery(api.jobDiscovery.listCurrentUserJobs, {});
  const discover = useAction(
    api.jobDiscoveryActions.discoverJobsForCurrentUser,
  );
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"completed" | "reused" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDiscover = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    setStatus(null);
    try {
      const summary = await discover({});
      setStatus(summary.status);
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
        : error === "SEARCH_ALREADY_RUNNING"
          ? "alreadyRunning"
          : error === "OPENAI_CONFIGURATION_ERROR"
            ? "configuration"
            : "provider";
  return (
    <section
      id="jobs"
      className="min-w-0 scroll-mt-6"
      aria-labelledby="jobs-title"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="jobs-title" className="text-xl font-bold sm:text-2xl">
          {t("dashboard.jobsTitle")}
        </h2>
        <Button
          onClick={() => void handleDiscover()}
          disabled={running}
          className="min-h-11"
        >
          {running ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Search aria-hidden="true" />
          )}
          {t(running ? "jobDiscovery.running" : "jobDiscovery.start")}
        </Button>
      </div>
      {status ? (
        <p role="status" className="text-primary mb-4 text-sm">
          {t(`jobDiscovery.${status}`)}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 mb-4 rounded-xl border p-4 text-sm"
        >
          <p>{t(`jobDiscovery.errors.${errorKey}`)}</p>
          {errorKey === "incomplete" ? (
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
                    <h3 className="text-lg font-semibold break-words">
                      {job.title}
                    </h3>
                    <p className="text-muted-foreground mt-1 break-words">
                      {job.companyName}
                    </p>
                  </div>
                </div>
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
                    <dt className="sr-only">{t("jobDiscovery.discovered")}</dt>
                    <dd>
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "medium",
                      }).format(job.discoveredAt)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">
                    {t("jobDiscovery.source", {
                      source: job.sourceName ?? new URL(job.sourceUrl).hostname,
                    })}
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

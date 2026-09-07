import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  BriefcaseBusiness,
  ExternalLink,
  LoaderCircle,
  MapPin,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";

export function JobDiscoveryPanel() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const view =
    searchParams.get("tab") === "in-progress" ? "inProgress" : "suggestions";
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
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );
  const formatDateTime = (value: number) => dateFormatter.format(value);
  return (
    <section aria-labelledby="jobs-title" className="min-w-0">
      <h1 id="jobs-title" className="sr-only">
        {t("dashboard.jobsTitle")}
      </h1>
      <Tabs.Root
        value={view}
        onValueChange={(value) => {
          if (value === view) return;
          const next = new URLSearchParams(searchParams);
          if (value === "inProgress") next.set("tab", "in-progress");
          else next.delete("tab");
          setSearchParams(next);
          setNotice(null);
          setError(false);
        }}
      >
        <Tabs.List
          aria-label={t("dashboard.jobsTitle")}
          className="bg-muted border-border mb-6 flex gap-1 rounded-2xl border p-1"
        >
          {(["suggestions", "inProgress"] as const).map((tab) => (
            <Tabs.Tab
              key={tab}
              value={tab}
              className="text-muted-foreground data-active:bg-card data-active:text-foreground focus-visible:ring-ring/40 min-h-11 flex-1 rounded-xl px-4 text-sm font-medium transition-[color,background-color,box-shadow] outline-none focus-visible:ring-3 data-active:shadow-sm motion-reduce:transition-none"
            >
              {t(`applications.${tab}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value={view} className="outline-none">
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
                    : "jobDiscovery.emptyTitle",
                )}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-md text-sm leading-7">
                {t(
                  view === "inProgress"
                    ? "applications.emptyDescription"
                    : "jobDiscovery.emptyDescription",
                )}
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {jobs.map((job) => {
                const salary =
                  job.salaryMin === null && job.salaryMax === null
                    ? null
                    : t("jobDiscovery.salary", {
                        min:
                          job.salaryMin?.toLocaleString(i18n.language) ?? "—",
                        max:
                          job.salaryMax?.toLocaleString(i18n.language) ?? "—",
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
                        <BriefcaseBusiness
                          aria-hidden="true"
                          className="size-5"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold break-words">
                          {job.title}
                        </h2>
                        <p className="text-muted-foreground mt-1 break-words">
                          {job.companyName}
                        </p>
                      </div>
                    </div>
                    <dl className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {job.locationText ? (
                        <div className="flex items-center gap-2">
                          <MapPin aria-hidden="true" className="size-4" />
                          <dt className="sr-only">
                            {t("jobDiscovery.location")}
                          </dt>
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
                        <dt className="sr-only">
                          {t("jobDiscovery.verified")}
                        </dt>
                        <dd>
                          {t("jobDiscovery.verifiedAt", {
                            date: formatDateTime(job.lastVerifiedAt),
                          })}
                        </dd>
                      </div>
                    </dl>
                    {"appliedAt" in job && job.appliedAt ? (
                      <p className="text-primary mt-4 text-sm">
                        {t("applications.sentAt", {
                          date: formatDateTime(job.appliedAt),
                        })}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
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
                          className="border-border bg-background hover:bg-muted focus-visible:ring-ring/40 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3"
                        >
                          {t("jobDiscovery.openPosting")}
                          <ExternalLink aria-hidden="true" className="size-4" />
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tabs.Panel>
      </Tabs.Root>
    </section>
  );
}

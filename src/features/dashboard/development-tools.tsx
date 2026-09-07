import { useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { CheckCircle2, LoaderCircle, Search, Wrench } from "lucide-react";
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

import { FloatingPanel } from "@/components/ui/floating-panel";
export function DevelopmentTools({ onEdit }: { onEdit: () => void }) {
  const { t, i18n } = useTranslation();
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
    <FloatingPanel
      label={t("dashboard.developmentTools")}
      icon={<Wrench aria-hidden="true" />}
      side="top"
      className="fixed start-5 bottom-5 z-30"
    >
      {" "}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">
            {t("dashboard.developmentTools")}
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
    </FloatingPanel>
  );
}

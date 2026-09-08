import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  CheckCircle2,
  DatabaseZap,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  return data &&
    typeof data === "object" &&
    "code" in data &&
    typeof data.code === "string"
    ? data.code
    : null;
}

export function DevelopmentTools({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  const discoveryState = useQuery(
    api.jobDiscovery.getCurrentUserDiscoveryState,
    {},
  );
  const discover = useAction(
    api.jobDiscoveryActions.discoverJobsForCurrentUser,
  );
  const seedResumeDemo = useAction(api.resumeActions.seedDevelopmentResume);
  const setPlan = useMutation(api.jobDiscovery.setDevelopmentPlan);
  const seedQualityDemo = useMutation(
    api.jobQualityFixtures.seedForCurrentUser,
  );
  const busyRef = useRef(false);
  const [pending, setPending] = useState<
    "plan" | "search" | "fixture" | "resume" | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const matchAudit = useQuery(
    api.jobDiscovery.getCurrentUserMatchAudit,
    auditOpen ? {} : "skip",
  );
  const paid = discoveryState?.plan !== "free";
  const busy = pending !== null || discoveryState?.runActive === true;

  const handlePlan = async (subscribed: boolean) => {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setPending("plan");
    setError(null);
    setStatus(null);
    try {
      await setPlan({ plan: subscribed ? "pro" : "free" });
    } catch {
      setError("plan");
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  };

  const handleDiscover = async () => {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setPending("search");
    setError(null);
    setStatus(null);
    try {
      const summary = await discover({});
      setStatus(summary.resultSource);
    } catch (cause) {
      const code = errorCode(cause);
      setError(
        code === "INCOMPLETE_SEARCH_PROFILE"
          ? "incomplete"
          : code === "LOCATION_RECONFIRM_REQUIRED"
            ? "locationReconfirm"
            : code === "JOB_SEARCH_DISABLED"
              ? "disabled"
              : code === "SEARCH_ALREADY_RUNNING"
                ? "alreadyRunning"
                : code === "DEV_TOOLS_DISABLED"
                  ? "devDisabled"
                  : code === "OPENAI_CONFIGURATION_ERROR" ||
                      code === "JOB_SEARCH_CONFIGURATION_ERROR"
                    ? "configuration"
                    : "provider",
      );
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  };

  const handleQualityDemo = async () => {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setPending("fixture");
    setError(null);
    setStatus(null);
    try {
      await seedQualityDemo({});
      setStatus("qualityDemo");
    } catch (cause) {
      setError(
        errorCode(cause) === "DEV_TOOLS_DISABLED" ? "devDisabled" : "demo",
      );
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  };

  const handleResumeDemo = async () => {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setPending("resume");
    setError(null);
    setStatus(null);
    try {
      await seedResumeDemo({});
    } catch {
      setError("demo");
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  };

  return (
    <FloatingPanel
      label={t("dashboard.developmentTools")}
      icon={<Wrench aria-hidden="true" />}
      side="top"
      className="fixed start-5 bottom-5 z-30"
    >
      <h2 className="px-1 py-2 text-base font-semibold">
        {t("dashboard.developmentTools")}
      </h2>
      <label className="hover:bg-muted flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-3">
        <span className="text-sm font-medium">
          {t("jobDiscovery.subscribed")}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={discoveryState ? paid : false}
          disabled={!discoveryState || busy}
          onChange={(event) => void handlePlan(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="bg-muted border-border peer-checked:bg-primary peer-focus-visible:ring-ring/40 relative h-6 w-11 shrink-0 rounded-full border transition-colors peer-focus-visible:ring-3 peer-disabled:opacity-50 motion-reduce:transition-none"
        >
          <span
            className={`bg-background absolute top-0.5 size-4.5 rounded-full shadow-sm transition-[inset-inline-start] motion-reduce:transition-none ${discoveryState && paid ? "start-5" : "start-0.5"}`}
          />
        </span>
      </label>
      <Button
        onClick={() => void handleDiscover()}
        disabled={!discoveryState || busy}
        className="mt-3 min-h-11 w-full"
      >
        {pending === "search" || discoveryState?.runActive ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : paid ? (
          <Search aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {t(
          pending === "search" || discoveryState?.runActive
            ? "jobDiscovery.running"
            : paid
              ? "jobDiscovery.start"
              : "jobDiscovery.refresh",
        )}
      </Button>
      <Button
        variant="outline"
        onClick={() => void handleQualityDemo()}
        disabled={!discoveryState || busy}
        className="mt-2 min-h-11 w-full"
      >
        {pending === "fixture" ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <DatabaseZap aria-hidden="true" />
        )}
        {t(
          pending === "fixture"
            ? "jobDiscovery.loadingDemo"
            : "jobDiscovery.loadDemo",
        )}
      </Button>
      <Button
        variant="outline"
        onClick={() => setAuditOpen((open) => !open)}
        disabled={!discoveryState}
        className="mt-2 min-h-11 w-full"
        aria-expanded={auditOpen}
      >
        <BarChart3 aria-hidden="true" />
        {t("jobDiscovery.audit.toggle")}
      </Button>
      {auditOpen ? (
        <div className="border-border mt-3 max-h-80 overflow-auto rounded-xl border p-3">
          {!matchAudit ? (
            <p className="text-muted-foreground text-sm">
              {t("jobDiscovery.audit.loading")}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                {(
                  [
                    ["centralJobs", matchAudit.counts.centralJobs],
                    [
                      "activeAndCanonical",
                      matchAudit.counts.activeAndCanonical,
                    ],
                    ["hardEligible", matchAudit.counts.hardEligible],
                    ["aboveThreshold", matchAudit.counts.aboveThreshold],
                    ["displayed", matchAudit.counts.displayed],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">
                      {t(`jobDiscovery.audit.${label}`)}
                    </dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <ol className="border-border mt-3 space-y-2 border-t pt-3 text-xs">
                {matchAudit.candidates.map((candidate) => (
                  <li key={candidate.jobId}>
                    <p className="font-medium">
                      {candidate.rank}. {candidate.title}
                    </p>
                    <p className="text-muted-foreground">
                      {candidate.companyName} · {candidate.relevanceScore} ·{" "}
                      {t(`jobDiscovery.audit.${candidate.decision}`)}
                    </p>
                    {candidate.exclusionReasons.length ? (
                      <p className="text-destructive/80">
                        {candidate.exclusionReasons.join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : null}
      <Button
        variant="outline"
        onClick={() => void handleResumeDemo()}
        disabled={!discoveryState || busy}
        className="mt-2 min-h-11 w-full"
      >
        {pending === "resume" ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <FileText aria-hidden="true" />
        )}
        {t(
          pending === "resume"
            ? "jobDiscovery.loadingResumeDemo"
            : "jobDiscovery.loadResumeDemo",
        )}
      </Button>
      {status ? (
        <p
          role="status"
          className="text-primary mt-3 flex items-start gap-2 text-sm"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t(`jobDiscovery.sources.${status}`)}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="text-destructive mt-3 text-sm">
          <p>{t(`jobDiscovery.errors.${error}`)}</p>
          {error === "incomplete" || error === "locationReconfirm" ? (
            <Button
              variant="ghost"
              className="mt-1 h-auto p-0 underline"
              onClick={onEdit}
            >
              {t("dashboard.editProfile")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </FloatingPanel>
  );
}

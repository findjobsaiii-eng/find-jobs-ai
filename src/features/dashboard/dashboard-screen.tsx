import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/product-layout";
import { DevelopmentTools } from "./development-tools";
import {
  JobDiscoveryPanel,
  type JobDiscoveryData,
} from "./job-discovery-panel";

function DashboardHeader({ view }: { view: "suggestions" | "inProgress" }) {
  const { t } = useTranslation();
  const isSaved = view === "inProgress";

  return (
    <PageHeader
      title={t(isSaved ? "applications.savedTitle" : "dashboard.jobsTitle")}
      description={t(
        isSaved ? "applications.savedDescription" : "dashboard.supportingText",
      )}
    />
  );
}

export function DashboardLoadingScreen({
  view,
}: {
  view: "suggestions" | "inProgress";
}) {
  const { t } = useTranslation();

  return (
    <>
      <DashboardHeader view={view} />
      <section
        role="status"
        aria-label={t("jobDiscovery.loading")}
        className="bg-card border-border min-h-80 rounded-3xl border p-5 shadow-[var(--brand-shadow-card)] sm:p-7"
      >
        <span className="sr-only">{t("jobDiscovery.loading")}</span>
        <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
          {["first", "second", "third"].map((row) => (
            <div
              key={row}
              className="border-border flex items-center gap-4 rounded-2xl border p-4"
            >
              <span className="bg-muted size-11 shrink-0 rounded-xl" />
              <span className="flex-1 space-y-2">
                <span className="bg-muted block h-3 w-2/5 rounded-full" />
                <span className="bg-muted block h-2.5 w-1/4 rounded-full" />
              </span>
              <span className="bg-muted h-7 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function DashboardScreen({
  view,
  onEdit,
  data,
  readOnly = false,
}: {
  view: "suggestions" | "inProgress";
  onEdit?: () => void;
  data?: JobDiscoveryData;
  readOnly?: boolean;
}) {
  const developmentTools = useQuery(
    api.jobDiscovery.developmentToolsEnabled,
    readOnly ? "skip" : {},
  );
  return (
    <>
      <DashboardHeader view={view} />
      <JobDiscoveryPanel
        view={view}
        onEdit={onEdit}
        data={data}
        readOnly={readOnly}
      />
      {developmentTools === true && onEdit ? (
        <DevelopmentTools onEdit={onEdit} />
      ) : null}
    </>
  );
}

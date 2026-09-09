import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/product-layout";
import { DevelopmentTools } from "./development-tools";
import { JobDiscoveryPanel } from "./job-discovery-panel";

export function DashboardScreen({
  view,
  onEdit,
}: {
  view: "suggestions" | "inProgress";
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const isSaved = view === "inProgress";
  const developmentTools = useQuery(
    api.jobDiscovery.developmentToolsEnabled,
    {},
  );
  return (
    <>
      <PageHeader
        title={t(isSaved ? "applications.savedTitle" : "dashboard.jobsTitle")}
        description={t(
          isSaved
            ? "applications.savedDescription"
            : "dashboard.supportingText",
        )}
      />
      <JobDiscoveryPanel view={view} />
      {developmentTools === true ? <DevelopmentTools onEdit={onEdit} /> : null}
    </>
  );
}

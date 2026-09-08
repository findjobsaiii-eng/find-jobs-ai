import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/product-layout";
import { ProfileOverview } from "@/features/profile/profile-overview";
import type { CurrentProfile } from "@/features/profile/profile-types";
import { AuthenticatedShell } from "./authenticated-shell";
import { DevelopmentTools } from "./development-tools";
import { JobDiscoveryPanel } from "./job-discovery-panel";

export function DashboardWorkspace({ data }: { data: CurrentProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Routes>
      <Route
        path="/profile"
        element={
          <AuthenticatedShell data={data}>
            <ProfileOverview data={data} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/profile/edit"
        element={<Navigate to={`/profile${location.search}`} replace />}
      />
      <Route
        path="/resume"
        element={<Navigate to="/profile#resumes" replace />}
      />
      <Route
        path="/"
        element={
          <AuthenticatedShell data={data}>
            <DashboardScreen onEdit={() => void navigate("/profile")} />
          </AuthenticatedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DashboardScreen({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const isSaved = location.search.includes("tab=in-progress");
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
      <JobDiscoveryPanel />
      {developmentTools === true ? <DevelopmentTools onEdit={onEdit} /> : null}
    </>
  );
}

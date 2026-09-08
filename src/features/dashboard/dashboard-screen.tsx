import { useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useQuery } from "convex/react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/product-layout";
import { OnboardingScreen } from "@/features/profile/onboarding-screen";
import { ProfileOverview } from "@/features/profile/profile-overview";
import type { CurrentProfile } from "@/features/profile/profile-types";
import { AuthenticatedShell } from "./authenticated-shell";
import { DevelopmentTools } from "./development-tools";
import { JobDiscoveryPanel } from "./job-discovery-panel";

export function DashboardWorkspace({ data }: { data: CurrentProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState(false);
  const returnTo =
    new URLSearchParams(location.search).get("tab") === "in-progress"
      ? "/?tab=in-progress"
      : "/profile";
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
        element={
          <OnboardingScreen
            initialData={data}
            editing={{
              onCancel: () => void navigate(returnTo),
              onSaved: () => {
                setSaved(true);
                void navigate(returnTo === "/profile" ? "/profile" : returnTo);
              },
            }}
          />
        }
      />
      <Route
        path="/resume"
        element={<Navigate to="/profile#resumes" replace />}
      />
      <Route
        path="/"
        element={
          <AuthenticatedShell data={data}>
            <DashboardScreen
              saved={saved}
              onEdit={() => void navigate("/profile/edit")}
            />
          </AuthenticatedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DashboardScreen({
  onEdit,
  saved,
}: {
  onEdit: () => void;
  saved: boolean;
}) {
  const { t } = useTranslation();
  const developmentTools = useQuery(
    api.jobDiscovery.developmentToolsEnabled,
    {},
  );
  return (
    <>
      <PageHeader
        title={t("dashboard.jobsTitle")}
        description={t("dashboard.supportingText")}
      />
      {saved ? (
        <p
          role="status"
          className="text-primary mb-5 flex items-center gap-2 text-sm"
        >
          <Check aria-hidden="true" className="size-4" />
          {t("dashboard.profileSaved")}
        </p>
      ) : null}
      <JobDiscoveryPanel />
      {developmentTools === true ? <DevelopmentTools onEdit={onEdit} /> : null}
    </>
  );
}

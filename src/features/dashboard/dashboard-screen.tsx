import { DirectionProvider } from "@base-ui/react/direction-provider";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Languages,
  LoaderCircle,
  LogOut,
  UserRound,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { OnboardingScreen } from "@/features/profile/onboarding-screen";
import type { CurrentProfile } from "@/features/profile/profile-types";
import { JobDiscoveryPanel } from "./job-discovery-panel";
import { DevelopmentTools } from "./development-tools";

export function DashboardWorkspace({ data }: { data: CurrentProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState(false);
  const returnTo =
    new URLSearchParams(location.search).get("tab") === "in-progress"
      ? "/?tab=in-progress"
      : "/";
  const profileUrl = `/profile${location.search}`;
  return (
    <Routes>
      <Route
        path="/profile"
        element={
          <OnboardingScreen
            initialData={data}
            editing={{
              onCancel: () => {
                void navigate(returnTo);
              },
              onSaved: () => {
                setSaved(true);
                void navigate(returnTo);
              },
            }}
          />
        }
      />
      <Route
        path="/"
        element={
          <DashboardScreen
            data={data}
            saved={saved}
            profileUrl={profileUrl}
            onEdit={() => {
              setSaved(false);
              void navigate(profileUrl);
            }}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DashboardScreen({
  data,
  onEdit,
  saved,
  profileUrl,
}: {
  data: CurrentProfile;
  onEdit: () => void;
  saved: boolean;
  profileUrl: string;
}) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuthActions();
  const developmentTools = useQuery(
    api.jobDiscovery.developmentToolsEnabled,
    {},
  );
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const signingOutRef = useRef(false);
  const displayName =
    data.profile?.preferredDisplayName ||
    data.identity.googleDisplayName ||
    t("dashboard.nav.profile");
  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };
  return (
    <DirectionProvider direction={i18n.dir()}>
      <div className="bg-muted/30 min-h-svh text-start">
        <FloatingPanel
          label={t("dashboard.userMenu")}
          icon={<UserRound aria-hidden="true" className="size-5" />}
          className="fixed start-5 top-5 z-30"
        >
          <p className="truncate px-3 py-2 font-semibold">{displayName}</p>
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start"
            render={<Link to={profileUrl} />}
            nativeButton={false}
            role="link"
          >
            <UserRound aria-hidden="true" />
            {t("dashboard.editProfile")}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start"
            aria-label={t("language.switchLabel")}
            onClick={() =>
              void i18n.changeLanguage(
                i18n.resolvedLanguage === "he" ? "en" : "he",
              )
            }
          >
            <Languages aria-hidden="true" />
            {t("language.otherLanguage")}
          </Button>
          <div className="border-border my-2 border-t" />
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {t("auth.signOut")}
          </Button>
          {signOutError ? (
            <p role="alert" className="text-destructive p-2 text-sm">
              {t("auth.signOutError")}
            </p>
          ) : null}
        </FloatingPanel>
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="mx-auto max-w-4xl px-4 pt-28 pb-28 sm:px-8"
        >
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
        </motion.main>
        {developmentTools === true ? (
          <DevelopmentTools onEdit={onEdit} />
        ) : null}
      </div>
    </DirectionProvider>
  );
}

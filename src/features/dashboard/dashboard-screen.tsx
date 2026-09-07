import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  Coins,
  FileText,
  House,
  LoaderCircle,
  LogOut,
  MapPin,
  PencilLine,
  Sparkles,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageButton } from "@/features/auth/language-button";
import { OnboardingScreen } from "@/features/profile/onboarding-screen";
import type { CurrentProfile } from "@/features/profile/profile-types";
import { getProfileCompletion } from "./dashboard-model";
import { JobDiscoveryPanel } from "./job-discovery-panel";
import { SavedLocation } from "./saved-location";
import { SearchFilters } from "./search-filters";

export function DashboardWorkspace({ data }: { data: CurrentProfile }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  if (editing)
    return (
      <OnboardingScreen
        initialData={data}
        editing={{
          onCancel: () => setEditing(false),
          onSaved: () => {
            setSaved(true);
            setEditing(false);
          },
        }}
      />
    );
  return (
    <DashboardScreen
      data={data}
      saved={saved}
      onEdit={() => {
        setSaved(false);
        setEditing(true);
      }}
      onPreferencesSaved={() => setSaved(true)}
    />
  );
}

function DashboardScreen({
  data,
  onEdit,
  saved,
  onPreferencesSaved,
}: {
  data: CurrentProfile;
  onEdit: () => void;
  saved: boolean;
  onPreferencesSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const signingOutRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const profile = data.profile;
  const displayName =
    profile?.preferredDisplayName ||
    data.identity.googleDisplayName ||
    t("dashboard.candidate");
  const completion = getProfileCompletion(data);
  const roleLabels = data.selections.targetJobTitles
    .map(
      (role) =>
        (i18n.language === "he" ? role.labelHe : role.labelEn) ||
        role.labelEn ||
        role.labelHe,
    )
    .join(", ");
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
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
  const navItems = [
    { id: "jobs", icon: BriefcaseBusiness },
    { id: "tools", icon: Wrench },
    { id: "tracking", icon: ChartNoAxesColumnIncreasing },
  ] as const;
  const tools = [
    { id: "cv", icon: FileText },
    { id: "tracking", icon: ChartNoAxesColumnIncreasing },
    { id: "interview", icon: Users },
  ] as const;
  const linkClass =
    "focus-visible:ring-ring/40 hover:text-primary flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-3";
  return (
    <div className="bg-muted/30 min-h-svh text-start">
      <header className="bg-card border-border border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span
            className="text-primary flex items-center gap-2 text-2xl font-bold tracking-tight"
            dir="ltr"
          >
            <Sparkles aria-hidden="true" className="size-7" />
            {t("dashboard.brand")}
          </span>
          <nav
            className="hidden items-center gap-2 md:flex"
            aria-label={t("dashboard.navigation")}
          >
            {navItems.map(({ id, icon: Icon }) => (
              <a key={id} href={`#${id}`} className={linkClass}>
                <Icon aria-hidden="true" className="size-4" />
                {t(`dashboard.nav.${id}`)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <LanguageButton />
            <details className="group relative">
              <summary
                className="focus-visible:ring-ring/40 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2 outline-none focus-visible:ring-3"
                aria-label={t("dashboard.userMenu")}
              >
                <span
                  className="bg-primary/10 text-primary grid size-9 place-items-center rounded-full font-semibold"
                  aria-hidden="true"
                >
                  {displayName.charAt(0)}
                </span>
                <span className="hidden max-w-28 truncate text-sm sm:block">
                  {displayName}
                </span>
                <ChevronDown aria-hidden="true" className="size-4" />
              </summary>
              <div className="bg-popover border-border absolute end-0 top-full z-20 mt-2 w-56 rounded-2xl border p-2 shadow-lg">
                <Button
                  variant="ghost"
                  className="min-h-11 w-full justify-start"
                  onClick={onEdit}
                >
                  <UserRound aria-hidden="true" />
                  {t("dashboard.editProfile")}
                </Button>
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
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-7 pb-28 sm:px-6 md:pb-10">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="grid gap-5 lg:grid-cols-2 lg:items-center"
        >
          <div>
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="text-3xl leading-tight font-bold tracking-tight break-words outline-none sm:text-4xl"
            >
              {t("dashboard.greeting", { displayName })}
            </h1>
            <p className="text-muted-foreground mt-3 text-base sm:text-lg">
              {t("dashboard.supportingText")}
            </p>
          </div>
          <section
            className="border-primary/15 bg-card rounded-2xl border p-5 shadow-sm"
            aria-labelledby="completion-title"
          >
            <div className="flex items-center gap-4">
              <span
                className="bg-primary/10 text-primary grid size-12 shrink-0 place-items-center rounded-2xl"
                aria-hidden="true"
              >
                {completion.percentage === 100 ? <Check /> : <UserRound />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="completion-title" className="font-semibold">
                  {t(
                    completion.percentage === 100
                      ? "dashboard.profileReady"
                      : "dashboard.completeProfile",
                  )}
                </h2>
                {completion.nextField ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t("dashboard.nextField", {
                      field: t(completion.nextField),
                    })}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-3">
                  <progress
                    className="[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary h-2 w-full flex-1 overflow-hidden rounded-full"
                    value={completion.percentage}
                    max={100}
                    aria-label={t("dashboard.completion")}
                  />
                  <span className="text-primary text-sm font-semibold tabular-nums">
                    {completion.percentage}%
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-4 min-h-11 w-full sm:w-auto"
              onClick={onEdit}
            >
              <PencilLine aria-hidden="true" />
              {t("dashboard.editProfile")}
            </Button>
          </section>
        </motion.section>
        {saved ? (
          <p
            role="status"
            className="text-primary flex items-center gap-2 text-sm"
          >
            <Check aria-hidden="true" className="size-4" />
            {t("dashboard.profileSaved")}
          </p>
        ) : null}

        <SearchFilters data={data} onSaved={onPreferencesSaved} />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <JobDiscoveryPanel onEdit={onEdit} />
          <aside className="min-w-0 space-y-5">
            <section
              id="tools"
              className="bg-card border-border scroll-mt-6 rounded-2xl border p-5 shadow-sm"
              aria-labelledby="tools-title"
            >
              <h2 id="tools-title" className="mb-4 text-lg font-semibold">
                {t("dashboard.toolsTitle")}
              </h2>
              <ul className="space-y-3">
                {tools.map(({ id, icon: Icon }) => (
                  <li
                    key={id}
                    className="bg-muted/40 flex items-center gap-3 rounded-xl p-3"
                  >
                    <Icon
                      aria-hidden="true"
                      className="text-primary size-5 shrink-0"
                    />
                    <span className="flex-1 text-sm font-medium">
                      {t(`dashboard.tools.${id}`)}
                    </span>
                    <span className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                      {t("dashboard.comingSoon")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section
              className="bg-card border-border rounded-2xl border p-5 shadow-sm"
              aria-labelledby="preferences-title"
            >
              <h2 id="preferences-title" className="mb-4 text-lg font-semibold">
                {t("dashboard.preferencesTitle")}
              </h2>
              <ul className="text-muted-foreground space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin aria-hidden="true" className="size-5 shrink-0" />
                  <span className="break-words">
                    <SavedLocation placeId={profile?.preferredPlaceIds?.[0]} />{" "}
                    ·{" "}
                    {t("onboarding.location.radiusOption", {
                      radius: profile?.locationRadiusKm ?? 25,
                    })}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <BriefcaseBusiness
                    aria-hidden="true"
                    className="size-5 shrink-0"
                  />
                  <span className="break-words">
                    {roleLabels || t("dashboard.anyRole")}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Coins aria-hidden="true" className="size-5 shrink-0" />
                  <span>
                    {profile?.minimumMonthlySalaryIls === undefined
                      ? t("dashboard.notSet")
                      : t("dashboard.salaryFrom", {
                          amount:
                            profile.minimumMonthlySalaryIls.toLocaleString(
                              i18n.language,
                            ),
                        })}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <House aria-hidden="true" className="size-5 shrink-0" />
                  <span>
                    {profile?.workArrangements
                      ?.map((value) =>
                        t(`onboarding.options.workArrangement.${value}`),
                      )
                      .join(", ") || t("dashboard.notSet")}
                  </span>
                </li>
              </ul>
              <p className="text-muted-foreground mt-4 text-xs">
                {t("onboarding.location.googleAttribution")}
              </p>
              <Button
                variant="outline"
                className="mt-4 min-h-11 w-full"
                onClick={onEdit}
              >
                <PencilLine aria-hidden="true" />
                {t("dashboard.edit")}
              </Button>
            </section>
            <section
              id="tracking"
              className="border-border scroll-mt-6 rounded-2xl border p-5"
              aria-labelledby="tracking-title"
            >
              <h2 id="tracking-title" className="font-semibold">
                {t("dashboard.tools.tracking")} · {t("dashboard.comingSoon")}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {t("dashboard.trackingDescription")}
              </p>
            </section>
          </aside>
        </div>
      </main>
      <nav
        className="bg-card/95 border-border fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        aria-label={t("dashboard.mobileNavigation")}
      >
        {navItems.map(({ id, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`${linkClass} flex-col gap-1 py-2`}
          >
            <Icon aria-hidden="true" className="size-5" />
            {t(`dashboard.nav.${id}`)}
          </a>
        ))}
        <button onClick={onEdit} className={`${linkClass} flex-col gap-1 py-2`}>
          <UserRound aria-hidden="true" className="size-5" />
          {t("dashboard.nav.profile")}
        </button>
      </nav>
    </div>
  );
}

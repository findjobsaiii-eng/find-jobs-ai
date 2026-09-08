import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  BriefcaseBusiness,
  Check,
  FileText,
  Languages,
  MapPin,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/product-layout";
import { cn } from "@/lib/utils";
import type { CurrentProfile } from "./profile-types";
import { ProfileEditor, type EditableProfileSection } from "./profile-editor";
import { ResumeLibrary } from "./resume-library";

type ProfileSection = "overview" | EditableProfileSection | "resumes";

const SECTION_IDS = new Set<ProfileSection>([
  "overview",
  "professional",
  "preferences",
  "languages",
  "resumes",
]);

export function ProfileOverview({ data }: { data: CurrentProfile }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const editRequested = Boolean(
    (location.state as { editProfile?: boolean } | null)?.editProfile,
  );
  const hashSection = location.hash.slice(1) as ProfileSection;
  const activeSection = SECTION_IDS.has(hashSection)
    ? hashSection
    : editRequested
      ? "professional"
      : "overview";
  const [saved, setSaved] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const profile = data.profile;
  const label = (item: (typeof data.selections.targetJobTitles)[number]) =>
    (i18n.resolvedLanguage === "he" ? item.labelHe : item.labelEn) ??
    item.labelEn ??
    item.labelHe;

  const sectionUrl = (section: ProfileSection) => ({
    pathname: "/profile",
    search: location.search,
    hash: section === "overview" ? "" : section,
  });

  useEffect(() => {
    if (editRequested && !location.hash) {
      void navigate(
        {
          pathname: "/profile",
          search: location.search,
          hash: "professional",
        },
        { replace: true },
      );
    }
  }, [editRequested, location.hash, location.search, navigate]);

  const sections = [
    { id: "overview", icon: UserRound },
    { id: "professional", icon: BriefcaseBusiness },
    { id: "preferences", icon: SlidersHorizontal },
    { id: "languages", icon: Languages },
    { id: "resumes", icon: FileText },
  ] as const;

  return (
    <div>
      <PageHeader
        title={t("profileOverview.title")}
        description={t("profileOverview.description")}
      />
      {saved ? (
        <p
          role="status"
          className="text-primary mb-4 flex items-center gap-2 text-sm"
        >
          <Check aria-hidden="true" className="size-4" />
          {t("dashboard.profileSaved")}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label={t("profileOverview.sectionNavigation")}
          className="bg-card border-border flex gap-1 overflow-x-auto rounded-xl border p-1.5 shadow-sm lg:sticky lg:top-24 lg:flex-col lg:overflow-visible"
        >
          {sections.map(({ id, icon: Icon }) => (
            <Link
              key={id}
              to={sectionUrl(id)}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={(event) => {
                if (
                  editorDirty &&
                  !window.confirm(t("dashboard.discardChanges"))
                ) {
                  event.preventDefault();
                  return;
                }
                setEditorDirty(false);
                setSaved(false);
              }}
              className={cn(
                "focus-visible:ring-ring/40 flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
                activeSection === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {t(`profileOverview.sections.${id}`)}
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          {activeSection === "overview" ? (
            <Surface>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {t("profileOverview.professionalSummary")}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t("profileOverview.summaryDescription")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link to={sectionUrl("professional")} />}
                >
                  <Pencil aria-hidden="true" />
                  {t("profileOverview.edit")}
                </Button>
              </div>

              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {t("profileOverview.targetRoles")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.selections.targetJobTitles.map((role) => (
                    <span
                      key={role.id}
                      className="bg-primary/10 text-primary rounded-full px-3 py-1.5 text-sm font-medium"
                    >
                      {label(role)}
                    </span>
                  ))}
                </div>
              </div>

              <dl className="border-border mt-6 grid gap-5 border-t pt-6 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                    <BriefcaseBusiness aria-hidden="true" className="size-4" />
                    {t("profileOverview.currentRole")}
                  </dt>
                  <dd className="mt-1.5 font-medium">
                    {profile?.cvCareerProfile?.currentTitle ??
                      t("profileOverview.notAvailable")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Sparkles aria-hidden="true" className="size-4" />
                    {t("profileOverview.experience")}
                  </dt>
                  <dd className="mt-1.5 font-medium">
                    {profile?.yearsOfExperience !== undefined
                      ? t("profileOverview.years", {
                          count: profile.yearsOfExperience,
                        })
                      : t("profileOverview.notAvailable")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                    <MapPin aria-hidden="true" className="size-4" />
                    {t("profileOverview.location")}
                  </dt>
                  <dd className="mt-1.5 font-medium">
                    {profile?.primaryLocation
                      ? t("profileOverview.locationValue", {
                          location:
                            profile.primaryLocation.city ??
                            profile.primaryLocation.formattedAddress,
                          radius: profile.primaryLocation.radiusKm,
                        })
                      : t("profileOverview.notAvailable")}
                  </dd>
                </div>
              </dl>

              <div className="border-border mt-6 border-t pt-6">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {t("profileOverview.skills")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.selections.skills.slice(0, 14).map((skill) => (
                    <span
                      key={skill.id}
                      className="bg-muted rounded-lg px-2.5 py-1.5 text-sm"
                    >
                      {label(skill)}
                    </span>
                  ))}
                </div>
              </div>
            </Surface>
          ) : null}

          {activeSection === "professional" ||
          activeSection === "preferences" ||
          activeSection === "languages" ? (
            <ProfileEditor
              key={activeSection}
              data={data}
              section={activeSection}
              onCancel={() => void navigate(sectionUrl("overview"))}
              onDirtyChange={setEditorDirty}
              onSaved={() => {
                setEditorDirty(false);
                setSaved(true);
                void navigate(sectionUrl("overview"));
              }}
            />
          ) : null}

          {activeSection === "resumes" ? <ResumeLibrary /> : null}
        </div>
      </div>
    </div>
  );
}

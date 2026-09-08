import { useState } from "react";
import { useLocation } from "react-router";
import {
  BriefcaseBusiness,
  Check,
  MapPin,
  Pencil,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  SectionHeader,
  Surface,
} from "@/components/ui/product-layout";
import type { CurrentProfile } from "./profile-types";
import { ProfileEditor } from "./profile-editor";
import { ResumeLibrary } from "./resume-library";

export function ProfileOverview({ data }: { data: CurrentProfile }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [editing, setEditing] = useState(() =>
    Boolean((location.state as { editProfile?: boolean } | null)?.editProfile),
  );
  const [saved, setSaved] = useState(false);
  const profile = data.profile;
  const label = (item: (typeof data.selections.targetJobTitles)[number]) =>
    (i18n.resolvedLanguage === "he" ? item.labelHe : item.labelEn) ??
    item.labelEn ??
    item.labelHe;
  if (editing) {
    return (
      <ProfileEditor
        data={data}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setSaved(true);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div>
      <PageHeader
        title={t("profileOverview.title")}
        description={t("profileOverview.description")}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" />
            {t("profileOverview.edit")}
          </Button>
        }
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,.7fr)]">
        <Surface>
          <SectionHeader title={t("profileOverview.professionalSummary")} />
          <div className="space-y-5">
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
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                  <BriefcaseBusiness aria-hidden="true" className="size-4" />
                  {t("profileOverview.currentRole")}
                </dt>
                <dd className="mt-1 font-medium">
                  {profile?.cvCareerProfile?.currentTitle ??
                    t("profileOverview.notAvailable")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Sparkles aria-hidden="true" className="size-4" />
                  {t("profileOverview.experience")}
                </dt>
                <dd className="mt-1 font-medium">
                  {profile?.yearsOfExperience !== undefined
                    ? t("profileOverview.years", {
                        count: profile.yearsOfExperience,
                      })
                    : t("profileOverview.notAvailable")}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                  <MapPin aria-hidden="true" className="size-4" />
                  {t("profileOverview.location")}
                </dt>
                <dd className="mt-1 font-medium">
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
          </div>
        </Surface>
        <Surface>
          <SectionHeader title={t("profileOverview.skills")} />
          <div className="flex flex-wrap gap-2">
            {data.selections.skills.slice(0, 14).map((skill) => (
              <span
                key={skill.id}
                className="bg-muted rounded-lg px-2.5 py-1.5 text-sm"
              >
                {label(skill)}
              </span>
            ))}
          </div>
          <div className="border-border mt-5 border-t pt-5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t("profileOverview.preferences")}
            </p>
            <p className="mt-2 text-sm leading-6">
              {(profile?.workArrangements ?? [])
                .map((value) =>
                  t("onboarding.options.workArrangement." + value),
                )
                .join(" · ")}
            </p>
          </div>
        </Surface>
      </div>
      <div className="mt-5">
        <ResumeLibrary />
      </div>
    </div>
  );
}

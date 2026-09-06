import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import {
  BriefcaseBusiness,
  Coins,
  House,
  MapPin,
  Search,
  SlidersHorizontal,
  LoaderCircle,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { StepThree } from "@/features/profile/onboarding-screen";
import { CatalogMultiSelect } from "@/features/profile/reference-multi-select";
import {
  createProfileDraft,
  profileDraftToValues,
  validateProfileStep,
  type CurrentProfile,
  type ProfileErrors,
} from "@/features/profile/profile-types";
import { SavedLocation } from "./saved-location";

export function SearchFilters({
  data,
  onSaved,
}: {
  data: CurrentProfile;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState(() => createProfileDraft(data));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const saveProfile = useMutation(api.candidateProfiles.saveCurrent);
  const roleLabels = draft.targetJobTitles
    .map(
      (role) =>
        (i18n.language === "he" ? role.labelHe : role.labelEn) ||
        role.labelEn ||
        role.labelHe,
    )
    .join(", ");
  const open = () => {
    setExpanded(true);
    setStatus("");
  };
  const clear = () => {
    setQuery("");
    setDraft((current) => ({
      ...current,
      targetJobTitles: [],
      preferredLocations: [],
      locationRadiusKm: 25,
      minimumMonthlySalaryIls: "",
      workArrangements: [],
      employmentTypes: [],
    }));
    setErrors({});
    setStatus("dashboard.filtersCleared");
  };
  const savePreferences = async () => {
    if (submitting.current) return;
    const nextErrors = validateProfileStep(3, draft);
    const roleError = validateProfileStep(1, draft).targetJobTitles;
    if (roleError) nextErrors.targetJobTitles = roleError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitting.current = true;
    setSaving(true);
    setStatus("");
    const values = profileDraftToValues(draft);
    try {
      await saveProfile({
        values: {
          targetJobTitleIds: values.targetJobTitleIds,
          preferredPlaceIds: values.preferredPlaceIds,
          locationRadiusKm: values.locationRadiusKm,
          minimumMonthlySalaryIls: values.minimumMonthlySalaryIls,
          workArrangements: values.workArrangements,
          employmentTypes: values.employmentTypes,
        },
        onboardingStep: 4,
        complete: true,
      });
      onSaved();
      setStatus("dashboard.preferencesSaved");
    } catch {
      setStatus("onboarding.errors.save");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <section
      className="bg-card border-border min-w-0 rounded-2xl border p-4 shadow-sm"
      aria-label={t("dashboard.filters")}
    >
      <p className="text-muted-foreground mb-3 text-xs">
        {t("dashboard.temporaryFilters")}
      </p>
      <fieldset disabled={saving} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="border-input focus-within:ring-ring/40 flex h-12 w-full items-center gap-2 rounded-xl border px-3 focus-within:ring-3 lg:w-56">
            <Search
              aria-hidden="true"
              className="text-primary size-5 shrink-0"
            />
            <span className="sr-only">{t("dashboard.searchQuery")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={120}
              placeholder={t("dashboard.searchQuery")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div
            className="flex max-w-full min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label={t("dashboard.filters")}
          >
            <Button
              variant="outline"
              className="h-11 max-w-64 shrink-0 rounded-full"
              onClick={open}
              aria-controls="search-preferences"
              aria-expanded={expanded}
            >
              <MapPin aria-hidden="true" />
              <span className="truncate">
                {draft.preferredLocations[0]?.label || (
                  <SavedLocation
                    placeId={draft.preferredLocations[0]?.placeId}
                  />
                )}
                {draft.preferredLocations.length
                  ? ` · ${t("onboarding.location.radiusOption", { radius: draft.locationRadiusKm })}`
                  : ""}
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-11 max-w-56 shrink-0 rounded-full"
              onClick={open}
              aria-controls="search-preferences"
              aria-expanded={expanded}
            >
              <BriefcaseBusiness aria-hidden="true" />
              <span className="truncate">
                {roleLabels || t("dashboard.anyRole")}
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-11 shrink-0 rounded-full"
              onClick={open}
              aria-controls="search-preferences"
              aria-expanded={expanded}
            >
              <Coins aria-hidden="true" />
              {draft.minimumMonthlySalaryIls
                ? t("dashboard.salaryFrom", {
                    amount: Number(
                      draft.minimumMonthlySalaryIls,
                    ).toLocaleString(i18n.language),
                  })
                : t("onboarding.fields.salary")}
            </Button>
            <Button
              variant="outline"
              className="h-11 shrink-0 rounded-full"
              onClick={open}
              aria-controls="search-preferences"
              aria-expanded={expanded}
            >
              <House aria-hidden="true" />
              {draft.workArrangements
                .map((value) =>
                  t(`onboarding.options.workArrangement.${value}`),
                )
                .join(", ") || t("onboarding.fields.workArrangement")}
            </Button>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto">
            <Button
              variant="outline"
              className="min-h-11 flex-1 lg:flex-none"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-controls="search-preferences"
            >
              <SlidersHorizontal aria-hidden="true" />
              {t("dashboard.moreFilters")}
            </Button>
            <Button
              className="min-h-11 flex-1 lg:flex-none"
              onClick={() => setStatus("dashboard.resultsPending")}
            >
              {t("dashboard.updateResults")}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={clear}>
              {t("dashboard.clearAll")}
            </Button>
          </div>
        </div>
        {expanded ? (
          <div
            id="search-preferences"
            className="border-border mt-5 space-y-6 border-t pt-5"
          >
            <CatalogMultiSelect
              kind="jobTitle"
              label={t("onboarding.fields.targetJobTitles")}
              placeholder={t("onboarding.placeholders.targetJobTitle")}
              values={draft.targetJobTitles}
              maxItems={5}
              onChange={(targetJobTitles) =>
                setDraft((current) => ({ ...current, targetJobTitles }))
              }
              error={errors.targetJobTitles && t(errors.targetJobTitles)}
            />
            <StepThree draft={draft} setDraft={setDraft} errors={errors} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void savePreferences()}>
                {saving ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : null}
                {t("dashboard.savePreferences")}
              </Button>
              <Button variant="ghost" onClick={() => setExpanded(false)}>
                {t("dashboard.closeFilters")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("dashboard.savePreferencesHint")}
            </p>
          </div>
        ) : null}
      </fieldset>
      <div role="status" className="text-muted-foreground mt-2 text-sm">
        {status ? t(status) : null}
      </div>
    </section>
  );
}

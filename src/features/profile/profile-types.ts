import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

export const WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote"] as const;
export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract"] as const;
export const LANGUAGE_PROFICIENCIES = [
  "basic",
  "conversational",
  "professional",
  "fluent",
  "native",
] as const;
export const SUPPORTED_LANGUAGES = [
  "he",
  "en",
  "ar",
  "ru",
  "fr",
  "am",
  "es",
  "uk",
  "ro",
  "yi",
] as const;
export const LOCATION_RADIUS_MIN_KM = 5;
export const LOCATION_RADIUS_MAX_KM = 200;
export const LOCATION_RADIUS_STEP_KM = 5;

export const PROFILE_LIMITS = {
  preferredDisplayName: { min: 2, max: 80 },
  targetJobTitles: { min: 1, max: 5 },
  professionalSummary: { max: 1_200 },
  yearsOfExperience: { min: 0, max: 60 },
  skills: { min: 1, max: 30 },
  preferredLocations: { min: 1, max: 10 },
  languages: { min: 1, max: 10 },
  minimumMonthlySalaryIls: { min: 1_000, max: 200_000 },
  steps: 4,
} as const;

export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];
export type CurrentProfile = FunctionReturnType<
  typeof api.candidateProfiles.getCurrent
>;
export type CatalogOption = FunctionReturnType<
  typeof api.referenceData.searchCatalog
>[number];
type SaveProfileArgs = FunctionArgs<typeof api.candidateProfiles.saveCurrent>;

export type SelectedPlace = {
  placeId: string;
  label: string;
  formattedAddress?: string;
  city?: string;
  administrativeArea?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

export function hasNormalizedLocation(
  place: SelectedPlace,
): place is SelectedPlace & {
  formattedAddress: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
} {
  return Boolean(
    place.formattedAddress &&
    place.country &&
    place.countryCode &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude),
  );
}

export type DraftLanguage = {
  languageCode: LanguageCode;
  proficiency: LanguageProficiency | "";
};

export type ProfileDraft = {
  preferredDisplayName: string;
  targetJobTitles: CatalogOption[];
  professionalSummary: string;
  yearsOfExperience: string;
  skills: CatalogOption[];
  preferredLocations: SelectedPlace[];
  locationRadiusKm: number;
  workArrangements: WorkArrangement[];
  employmentTypes: EmploymentType[];
  minimumMonthlySalaryIls: string;
  languages: DraftLanguage[];
};

export type ProfileField = keyof ProfileDraft;
export type ProfileErrors = Partial<Record<ProfileField, string>>;

export function isSupportedLocationRadius(radius: number) {
  return (
    Number.isSafeInteger(radius) &&
    radius >= LOCATION_RADIUS_MIN_KM &&
    radius <= LOCATION_RADIUS_MAX_KM &&
    radius % LOCATION_RADIUS_STEP_KM === 0
  );
}

export function createProfileDraft(data: CurrentProfile): ProfileDraft {
  const profile = data.profile;
  const savedLanguages = profile?.languages?.map((language) => ({
    languageCode: language.languageCode as LanguageCode,
    proficiency: language.proficiency,
  }));
  return {
    preferredDisplayName:
      profile?.preferredDisplayName ?? data.identity.googleDisplayName ?? "",
    targetJobTitles: data.selections.targetJobTitles,
    professionalSummary: profile?.professionalSummary ?? "",
    yearsOfExperience:
      profile?.yearsOfExperience === undefined
        ? "0"
        : String(profile.yearsOfExperience),
    skills: data.selections.skills,
    preferredLocations: profile?.primaryLocation
      ? [
          {
            placeId: profile.primaryLocation.placeId,
            label:
              profile.primaryLocation.city ||
              profile.primaryLocation.formattedAddress,
            formattedAddress: profile.primaryLocation.formattedAddress,
            city: profile.primaryLocation.city,
            administrativeArea: profile.primaryLocation.administrativeArea,
            country: profile.primaryLocation.country,
            countryCode: profile.primaryLocation.countryCode,
            latitude: profile.primaryLocation.latitude,
            longitude: profile.primaryLocation.longitude,
          },
        ]
      : (profile?.preferredPlaceIds?.map((placeId) => ({
          placeId,
          label: "",
        })) ?? []),
    locationRadiusKm: profile?.locationRadiusKm ?? 25,
    workArrangements: profile?.workArrangements ?? [],
    employmentTypes: profile?.employmentTypes ?? [],
    minimumMonthlySalaryIls:
      profile?.minimumMonthlySalaryIls === undefined
        ? ""
        : String(profile.minimumMonthlySalaryIls),
    languages: savedLanguages?.length
      ? savedLanguages
      : [
          { languageCode: "he", proficiency: "native" },
          { languageCode: "en", proficiency: "professional" },
        ],
  };
}

export function profileDraftToValues(
  draft: ProfileDraft,
): SaveProfileArgs["values"] {
  const selectedLocation = draft.preferredLocations[0];
  return {
    preferredDisplayName: draft.preferredDisplayName.trim() || null,
    targetJobTitleIds: draft.targetJobTitles.map((item) => item.id),
    professionalSummary: draft.professionalSummary.trim() || null,
    yearsOfExperience:
      draft.yearsOfExperience === "" ? null : Number(draft.yearsOfExperience),
    skillIds: draft.skills.map((item) => item.id),
    preferredPlaceIds: draft.preferredLocations.map((item) => item.placeId),
    locationRadiusKm: draft.locationRadiusKm,
    primaryLocation:
      selectedLocation && hasNormalizedLocation(selectedLocation)
        ? {
            placeId: selectedLocation.placeId,
            formattedAddress: selectedLocation.formattedAddress,
            city: selectedLocation.city,
            administrativeArea: selectedLocation.administrativeArea,
            country: selectedLocation.country,
            countryCode: selectedLocation.countryCode,
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
            radiusKm: draft.locationRadiusKm,
          }
        : null,
    workArrangements: draft.workArrangements,
    employmentTypes: draft.employmentTypes,
    minimumMonthlySalaryIls:
      draft.minimumMonthlySalaryIls === ""
        ? null
        : Number(draft.minimumMonthlySalaryIls),
    languages: draft.languages
      .filter(
        (
          language,
        ): language is DraftLanguage & {
          proficiency: LanguageProficiency;
        } => Boolean(language.proficiency),
      )
      .map(({ languageCode, proficiency }) => ({
        languageCode,
        proficiency,
      })),
  };
}

export function getInitialStep(data: CurrentProfile) {
  const savedStep = data.profile?.onboardingStep ?? 1;
  return Math.min(PROFILE_LIMITS.steps, Math.max(1, Math.trunc(savedStep)));
}

export function validateProfileStep(
  step: number,
  draft: ProfileDraft,
): ProfileErrors {
  const errors: ProfileErrors = {};
  if (step === 1) {
    const nameLength = draft.preferredDisplayName.trim().length;
    if (
      nameLength < PROFILE_LIMITS.preferredDisplayName.min ||
      nameLength > PROFILE_LIMITS.preferredDisplayName.max
    ) {
      errors.preferredDisplayName = "onboarding.errors.displayName";
    }
    if (
      draft.targetJobTitles.length < PROFILE_LIMITS.targetJobTitles.min ||
      draft.targetJobTitles.length > PROFILE_LIMITS.targetJobTitles.max
    ) {
      errors.targetJobTitles = "onboarding.errors.targetJobTitles";
    }
  }
  if (step === 2) {
    const summaryLength = draft.professionalSummary.trim().length;
    if (summaryLength > PROFILE_LIMITS.professionalSummary.max) {
      errors.professionalSummary = "onboarding.errors.summary";
    }
    const years = Number(draft.yearsOfExperience);
    if (
      draft.yearsOfExperience === "" ||
      !Number.isSafeInteger(years) ||
      years < PROFILE_LIMITS.yearsOfExperience.min ||
      years > PROFILE_LIMITS.yearsOfExperience.max
    ) {
      errors.yearsOfExperience = "onboarding.errors.years";
    }
    if (
      draft.skills.length < PROFILE_LIMITS.skills.min ||
      draft.skills.length > PROFILE_LIMITS.skills.max
    ) {
      errors.skills = "onboarding.errors.skills";
    }
  }
  if (step === 3) {
    if (
      draft.preferredLocations.length < PROFILE_LIMITS.preferredLocations.min ||
      draft.preferredLocations.length > PROFILE_LIMITS.preferredLocations.max
    ) {
      errors.preferredLocations = "onboarding.errors.locations";
    } else if (!hasNormalizedLocation(draft.preferredLocations[0])) {
      errors.preferredLocations = "onboarding.errors.locationReconfirm";
    }
    if (!isSupportedLocationRadius(draft.locationRadiusKm)) {
      errors.locationRadiusKm = "onboarding.errors.locationRadius";
    }
    if (draft.workArrangements.length === 0) {
      errors.workArrangements = "onboarding.errors.workArrangements";
    }
    if (draft.employmentTypes.length === 0) {
      errors.employmentTypes = "onboarding.errors.employmentTypes";
    }
    if (draft.minimumMonthlySalaryIls !== "") {
      const salary = Number(draft.minimumMonthlySalaryIls);
      if (
        !Number.isSafeInteger(salary) ||
        salary < PROFILE_LIMITS.minimumMonthlySalaryIls.min ||
        salary > PROFILE_LIMITS.minimumMonthlySalaryIls.max
      ) {
        errors.minimumMonthlySalaryIls = "onboarding.errors.salary";
      }
    }
  }
  if (step === 4) {
    if (
      draft.languages.length < PROFILE_LIMITS.languages.min ||
      draft.languages.length > PROFILE_LIMITS.languages.max ||
      draft.languages.some((language) => !language.proficiency)
    ) {
      errors.languages = "onboarding.errors.languages";
    }
  }
  return errors;
}

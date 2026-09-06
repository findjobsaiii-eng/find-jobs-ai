import {
  createProfileDraft,
  validateProfileStep,
  type CurrentProfile,
  type ProfileField,
  type ProfileErrors,
} from "@/features/profile/profile-types";

export const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
  preferredDisplayName: "onboarding.fields.displayName",
  targetJobTitles: "onboarding.fields.targetJobTitles",
  professionalSummary: "onboarding.fields.summary",
  yearsOfExperience: "onboarding.fields.years",
  skills: "onboarding.fields.skills",
  preferredLocations: "onboarding.fields.locations",
  locationRadiusKm: "onboarding.fields.locationRadius",
  workArrangements: "onboarding.fields.workArrangement",
  employmentTypes: "onboarding.fields.employmentTypes",
  minimumMonthlySalaryIls: "onboarding.fields.salary",
  languages: "onboarding.steps.4.eyebrow",
};

export function getProfileCompletion(data: CurrentProfile) {
  const draft = createProfileDraft(data);
  // Defaults help a new form, but must not count as saved information.
  draft.preferredDisplayName = data.profile?.preferredDisplayName ?? "";
  const errors: ProfileErrors = {};
  for (const step of [1, 2, 3, 4]) {
    Object.assign(errors, validateProfileStep(step, draft));
  }
  if (data.profile?.locationRadiusKm === undefined)
    errors.locationRadiusKm = "onboarding.errors.locationRadius";
  const fields = Object.keys(PROFILE_FIELD_LABELS) as ProfileField[];
  const missing = fields.filter((field) => field in errors);
  return {
    percentage: Math.round(
      ((fields.length - missing.length) / fields.length) * 100,
    ),
    nextField: missing[0] ? PROFILE_FIELD_LABELS[missing[0]] : null,
  };
}

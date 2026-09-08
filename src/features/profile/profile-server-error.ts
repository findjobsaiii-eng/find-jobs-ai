import { ConvexError } from "convex/values";
import type { ProfileField } from "./profile-types";

const PROFILE_FIELD_STEPS: Record<ProfileField, number> = {
  preferredDisplayName: 1,
  targetJobTitles: 1,
  professionalSummary: 2,
  yearsOfExperience: 2,
  skills: 2,
  preferredLocations: 3,
  locationRadiusKm: 3,
  workArrangements: 3,
  employmentTypes: 3,
  minimumMonthlySalaryIls: 3,
  languages: 4,
};

export function getProfileFieldStep(field: ProfileField) {
  return PROFILE_FIELD_STEPS[field];
}

export function getProfileServerError(error: unknown) {
  if (
    !(error instanceof ConvexError) ||
    typeof error.data !== "object" ||
    !error.data
  ) {
    return { key: "onboarding.errors.save", field: null } as const;
  }
  const data = error.data as { code?: unknown; field?: unknown };
  if (data.code === "UNAUTHENTICATED") {
    return { key: "onboarding.errors.authentication", field: null } as const;
  }
  if (data.code === "MISSING_GOOGLE_EMAIL") {
    return { key: "onboarding.errors.googleEmail", field: null } as const;
  }
  if (
    data.code === "VALIDATION_ERROR" &&
    typeof data.field === "string" &&
    data.field in PROFILE_FIELD_STEPS
  ) {
    return {
      key: "onboarding.errors.reviewFields",
      field: data.field as ProfileField,
    } as const;
  }
  return { key: "onboarding.errors.save", field: null } as const;
}

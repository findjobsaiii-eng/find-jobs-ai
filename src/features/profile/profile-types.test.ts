import { describe, expect, it } from "vitest";
import {
  createProfileDraft,
  profileDraftToValues,
  validateProfileStep,
  type CurrentProfile,
} from "./profile-types";

function profileData(preferredPlaceIds: string[] = [], locationRadiusKm = 25) {
  return {
    identity: {
      userId: "users:user-1",
      email: "candidate@example.com",
      googleDisplayName: "Candidate",
      profileImage: null,
    },
    profile: {
      _id: "candidateProfiles:profile-1",
      _creationTime: 1,
      userId: "users:user-1",
      email: "candidate@example.com",
      preferredPlaceIds,
      locationRadiusKm,
      onboardingStep: 3,
      onboardingCompleted: false,
      createdAt: 1,
      updatedAt: 1,
    },
    selections: { targetJobTitles: [], skills: [] },
  } as unknown as CurrentProfile;
}

describe("profile location draft", () => {
  it("resumes Place IDs without persisting Google labels", () => {
    const draft = createProfileDraft(
      profileData(["ChIJH3w7GaZMHRURkD-WwKJy-8E"], 50),
    );

    expect(draft.preferredLocations).toEqual([
      { placeId: "ChIJH3w7GaZMHRURkD-WwKJy-8E", label: "" },
    ]);
    expect(draft.locationRadiusKm).toBe(50);
    expect(profileDraftToValues(draft)).toMatchObject({
      preferredPlaceIds: ["ChIJH3w7GaZMHRURkD-WwKJy-8E"],
      locationRadiusKm: 50,
      primaryLocation: null,
    });
    expect(validateProfileStep(3, draft)).toMatchObject({
      preferredLocations: "onboarding.errors.locationReconfirm",
    });

    expect(
      createProfileDraft({ ...profileData(), profile: null }),
    ).toMatchObject({ locationRadiusKm: 25 });
  });

  it("requires a selected location and an approved radius on step three", () => {
    const draft = createProfileDraft(profileData());
    draft.locationRadiusKm = 17;

    expect(validateProfileStep(3, draft)).toMatchObject({
      preferredLocations: "onboarding.errors.locations",
      locationRadiusKm: "onboarding.errors.locationRadius",
    });
  });
});

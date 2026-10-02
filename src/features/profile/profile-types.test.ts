import { describe, expect, it } from "vitest";
import {
  createProfileDraft,
  profileDraftToValues,
  profileDraftChanges,
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
  it("prefills common languages without replacing saved choices", () => {
    expect(createProfileDraft(profileData()).languages).toEqual([
      { languageCode: "he", proficiency: "native" },
      { languageCode: "en", proficiency: "professional" },
    ]);

    const withSavedLanguage = profileData() as CurrentProfile;
    if (!withSavedLanguage.profile) throw new Error("Expected profile data");
    withSavedLanguage.profile.languages = [
      { languageCode: "ar", proficiency: "fluent" },
    ];

    expect(createProfileDraft(withSavedLanguage).languages).toEqual([
      { languageCode: "ar", proficiency: "fluent" },
    ]);
  });

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

    const errors = validateProfileStep(3, draft);
    expect(errors).toMatchObject({
      preferredLocations: "onboarding.errors.locations",
      locationRadiusKm: "onboarding.errors.locationRadius",
    });
    expect(errors).not.toHaveProperty("minimumMonthlySalaryIls");
  });

  it("defaults experience to zero and allows an empty professional summary", () => {
    const draft = createProfileDraft({ ...profileData(), profile: null });

    expect(draft.yearsOfExperience).toBe("0");
    expect(validateProfileStep(2, draft)).not.toHaveProperty(
      "professionalSummary",
    );

    draft.professionalSummary = "x".repeat(1_201);
    expect(validateProfileStep(2, draft)).toMatchObject({
      professionalSummary: "onboarding.errors.summary",
    });
  });
});

describe("optional qualifications draft", () => {
  it("does not turn missing education into a manual confirmation during onboarding", () => {
    const draft = createProfileDraft(profileData());
    expect(draft.qualifications).toEqual({
      academicDegreeStatus: "none",
      education: [],
    });
    expect(profileDraftToValues(draft)).not.toHaveProperty("qualifications");
    draft.qualifications = { academicDegreeStatus: "none", education: [] };
    draft.qualificationsEdited = true;
    expect(profileDraftToValues(draft).qualifications).toEqual(
      draft.qualifications,
    );
  });
  it("defaults unspecified CV completion to Completed while preserving students", () => {
    const data = profileData();
    if (!data.profile) throw new Error("Expected profile");
    data.profile.qualifications = {
      academicDegreeStatus: "none",
      education: [
        {
          level: "bachelor",
          status: "unknown",
          field: "Computer Science",
          credential: "B.Sc.",
        },
        {
          level: "master",
          status: "in_progress",
          field: "Computer Science",
          credential: "M.Sc.",
        },
      ],
    };
    const draft = createProfileDraft(data);
    expect(draft.qualifications.education.map((item) => item.status)).toEqual([
      "completed",
      "in_progress",
    ]);
    expect(
      profileDraftToValues(draft).qualifications?.education.map(
        (item) => item.status,
      ),
    ).toEqual(["completed", "in_progress"]);
    expect(validateProfileStep(2, draft)).not.toHaveProperty("qualifications");
  });
});

it("does not mark untouched CV defaults as user confirmations when only education changes", () => {
  const original = createProfileDraft(profileData());
  const edited = {
    ...original,
    qualificationsEdited: true,
    qualifications: { academicDegreeStatus: "none" as const, education: [] },
  };
  expect(profileDraftChanges(edited, original)).toEqual({
    qualifications: { academicDegreeStatus: "none", education: [] },
  });
  expect(
    profileDraftChanges({ ...original, yearsOfExperience: "3" }, original),
  ).toEqual({ yearsOfExperience: 3 });
});

it("prefills CV experience areas and keeps explicit empty or corrected selections authoritative", () => {
  const data = profileData();
  data.profile!.cvCareerProfile = {
    domains: ["Software development and insurance customer service"],
  } as NonNullable<CurrentProfile["profile"]>["cvCareerProfile"];
  const original = createProfileDraft(data);
  expect(original.experienceDomains).toEqual([
    "Software development and insurance customer service",
  ]);
  const corrected = {
    ...original,
    experienceDomains: ["Customer Service", "Insurance"],
  };
  expect(profileDraftChanges(corrected, original)).toEqual({
    experienceDomains: ["Customer Service", "Insurance"],
  });
  data.profile!.experienceDomains = [];
  expect(createProfileDraft(data).experienceDomains).toEqual([]);
  expect(
    profileDraftChanges({ ...original, experienceDomains: [] }, original),
  ).toEqual({ experienceDomains: [] });
});

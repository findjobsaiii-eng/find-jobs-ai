/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";

it("updates a completed profile through the existing mutation without resetting completion or identity", async () => {
  const t = convexTest(schema, import.meta.glob("../../../convex/**/*.ts"));
  const { userId, titleId, skillId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "owner@example.com",
      name: "Google Name",
    });
    const base = {
      visibility: "public" as const,
      source: "curated" as const,
      active: true,
      createdAt: 1,
      updatedAt: 1,
      priority: 1,
    };
    const titleId = await ctx.db.insert("catalogItems", {
      ...base,
      kind: "jobTitle",
      labelEn: "Engineer",
      normalizedKey: "engineer",
      normalizedLabels: ["engineer"],
      searchText: "engineer",
    });
    const skillId = await ctx.db.insert("catalogItems", {
      ...base,
      kind: "skill",
      labelEn: "React",
      normalizedKey: "react",
      normalizedLabels: ["react"],
      searchText: "react",
    });
    return { userId, titleId, skillId };
  });
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  const original = await user.mutation(api.candidateProfiles.saveCurrent, {
    complete: true,
    onboardingStep: 4,
    values: {
      preferredDisplayName: "Candidate",
      targetJobTitleIds: [titleId],
      professionalSummary:
        "Experienced engineer creating accessible and responsive applications.",
      yearsOfExperience: 5,
      skillIds: [skillId],
      preferredPlaceIds: ["place-one"],
      locationRadiusKm: 25,
      primaryLocation: {
        placeId: "place-one",
        formattedAddress: "Tel Aviv-Yafo, Israel",
        city: "Tel Aviv-Yafo",
        administrativeArea: "Tel Aviv District",
        country: "Israel",
        countryCode: "IL",
        latitude: 32.0853,
        longitude: 34.7818,
        radiusKm: 25,
      },
      workArrangements: ["hybrid"],
      employmentTypes: ["full-time"],
      minimumMonthlySalaryIls: 15000,
      languages: [{ languageCode: "he", proficiency: "native" }],
    },
  });
  const updated = await user.mutation(api.candidateProfiles.saveCurrent, {
    complete: true,
    onboardingStep: 4,
    values: { preferredDisplayName: "Updated Candidate", locationRadiusKm: 40 },
  });
  expect(updated).toMatchObject({
    _id: original._id,
    userId,
    email: "owner@example.com",
    googleDisplayName: "Google Name",
    preferredDisplayName: "Updated Candidate",
    locationRadiusKm: 40,
    onboardingCompleted: true,
    completedAt: original.completedAt,
  });
  expect(updated.primaryLocation?.radiusKm).toBe(40);
  expect((await user.query(api.candidateProfiles.getCurrent)).profile).toEqual(
    updated,
  );
});

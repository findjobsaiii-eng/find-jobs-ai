/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createUser(
  t: TestConvex<typeof schema>,
  email: string,
  name: string,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email,
      name,
      image: `https://example.com/${name}.png`,
    });
  });
}

function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
}

async function createReferences(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const titleId = await ctx.db.insert("catalogItems", {
      kind: "jobTitle",
      labelEn: "Frontend Engineer",
      labelHe: "מפתח Frontend",
      normalizedKey: "frontend engineer",
      normalizedLabels: ["frontend engineer", "מפתח frontend"],
      searchText: "Frontend Engineer מפתח Frontend",
      visibility: "public",
      source: "curated",
      externalId: "frontend-engineer",
      priority: 100,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const skillId = await ctx.db.insert("catalogItems", {
      kind: "skill",
      labelEn: "React",
      labelHe: "React",
      normalizedKey: "react",
      normalizedLabels: ["react"],
      searchText: "React",
      visibility: "public",
      source: "curated",
      externalId: "react",
      priority: 100,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { titleId, skillId };
  });
}

describe("candidate profiles", () => {
  it("rejects unauthenticated profile and reference-data access", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.candidateProfiles.getCurrent)).rejects.toThrow();
    await expect(
      t.mutation(api.candidateProfiles.saveCurrent, {
        values: {},
        onboardingStep: 1,
        complete: false,
      }),
    ).rejects.toThrow();
    await expect(
      t.query(api.referenceData.searchCatalog, {
        kind: "skill",
        search: "",
      }),
    ).rejects.toThrow();
  });

  it("normalizes and resumes a partial profile for its owning user", async () => {
    const t = convexTest(schema, modules);
    const { titleId } = await createReferences(t);
    const userId = await createUser(t, "BEN@EXAMPLE.COM ", " Ben Candidate ");
    const user = asUser(t, userId);

    const saved = await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        preferredDisplayName: "  Benny   Candidate ",
        targetJobTitleIds: [titleId, titleId],
      },
      onboardingStep: 2,
      complete: false,
    });

    expect(saved).toMatchObject({
      userId,
      email: "ben@example.com",
      googleDisplayName: "Ben Candidate",
      preferredDisplayName: "Benny Candidate",
      targetJobTitleIds: [titleId],
      onboardingStep: 2,
      onboardingCompleted: false,
    });
    const resumed = await user.query(api.candidateProfiles.getCurrent);
    expect(resumed.profile?._id).toBe(saved._id);
    expect(resumed.selections.targetJobTitles).toMatchObject([
      { id: titleId, labelEn: "Frontend Engineer", isCustom: false },
    ]);

    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: { preferredDisplayName: null, targetJobTitleIds: [] },
      onboardingStep: 1,
      complete: false,
    });
    const cleared = await user.query(api.candidateProfiles.getCurrent);
    expect(cleared.profile?.preferredDisplayName).toBeUndefined();
    expect(cleared.profile?.targetJobTitleIds).toEqual([]);
  });

  it("isolates profile reads and private catalog items by identity", async () => {
    const t = convexTest(schema, modules);
    const firstId = await createUser(t, "one@example.com", "One");
    const secondId = await createUser(t, "two@example.com", "Two");
    const first = asUser(t, firstId);
    const second = asUser(t, secondId);

    const privateTitle = await first.mutation(
      api.referenceData.addCustomCatalogItem,
      { kind: "jobTitle", label: "Space Elevator Operator", locale: "en" },
    );
    const duplicate = await first.mutation(
      api.referenceData.addCustomCatalogItem,
      { kind: "jobTitle", label: "  space elevator operator ", locale: "en" },
    );
    expect(duplicate.id).toBe(privateTitle.id);

    await first.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        preferredDisplayName: "First User",
        targetJobTitleIds: [privateTitle.id],
      },
      onboardingStep: 1,
      complete: false,
    });
    await second.mutation(api.candidateProfiles.saveCurrent, {
      values: { preferredDisplayName: "Second User" },
      onboardingStep: 1,
      complete: false,
    });

    expect(
      (await first.query(api.candidateProfiles.getCurrent)).profile,
    ).toMatchObject({ userId: firstId, preferredDisplayName: "First User" });
    expect(
      (await second.query(api.candidateProfiles.getCurrent)).selections
        .targetJobTitles,
    ).toEqual([]);
    await expect(
      second.mutation(api.candidateProfiles.saveCurrent, {
        values: { targetJobTitleIds: [privateTitle.id] },
        onboardingStep: 1,
        complete: false,
      }),
    ).rejects.toThrow();
  });

  it("requires valid references and complete fields before completion", async () => {
    const t = convexTest(schema, modules);
    const { titleId, skillId } = await createReferences(t);
    const userId = await createUser(t, "candidate@example.com", "Candidate");
    const user = asUser(t, userId);

    await expect(
      user.mutation(api.candidateProfiles.saveCurrent, {
        values: { preferredDisplayName: "Candidate" },
        onboardingStep: 4,
        complete: true,
      }),
    ).rejects.toThrow();

    const completed = await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        preferredDisplayName: "Candidate",
        targetJobTitleIds: [titleId],
        professionalSummary:
          "Frontend engineer focused on accessible, responsive product experiences.",
        yearsOfExperience: 7,
        skillIds: [skillId],
        preferredPlaceIds: ["ChIJH3w7GaZMHRURkD-WwKJy-8E"],
        locationRadiusKm: 40,
        primaryLocation: {
          placeId: "ChIJH3w7GaZMHRURkD-WwKJy-8E",
          formattedAddress: "Tel Aviv-Yafo, Israel",
          city: "Tel Aviv-Yafo",
          administrativeArea: "Tel Aviv District",
          country: "Israel",
          countryCode: "il",
          latitude: 32.0853,
          longitude: 34.7818,
          radiusKm: 40,
        },
        workArrangements: ["hybrid", "remote"],
        employmentTypes: ["full-time"],
        minimumMonthlySalaryIls: 30_000,
        languages: [
          { languageCode: "he", proficiency: "native" },
          { languageCode: "en", proficiency: "fluent" },
          { languageCode: "ar", proficiency: "conversational" },
        ],
      },
      onboardingStep: 4,
      complete: true,
    });

    expect(completed.onboardingCompleted).toBe(true);
    expect(completed.workArrangements).toEqual(["hybrid", "remote"]);
    expect(completed.preferredPlaceIds).toEqual([
      "ChIJH3w7GaZMHRURkD-WwKJy-8E",
    ]);
    expect(completed.locationRadiusKm).toBe(40);
    expect(completed.primaryLocation).toMatchObject({
      city: "Tel Aviv-Yafo",
      countryCode: "IL",
      radiusKm: 40,
    });
    expect(completed.languages).toHaveLength(3);
    expect(completed.completedAt).toEqual(expect.any(Number));
  });

  it("rejects unsupported radii and empty place identifiers", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, "candidate@example.com", "Candidate");
    const user = asUser(t, userId);

    await expect(
      user.mutation(api.candidateProfiles.saveCurrent, {
        values: { preferredPlaceIds: ["   "] },
        onboardingStep: 3,
        complete: false,
      }),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.candidateProfiles.saveCurrent, {
        values: { locationRadiusKm: 17 },
        onboardingStep: 3,
        complete: false,
      }),
    ).rejects.toThrow();
  });
});

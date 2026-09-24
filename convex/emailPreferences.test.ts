/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("email preferences", () => {
  it("defaults to daily and lets only the signed-in user change frequency", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "candidate@example.com" }),
    );
    const signedIn = t.withIdentity({
      subject: `${userId}|test`,
      issuer: "https://test.example",
      tokenIdentifier: `https://test.example|${userId}`,
    });

    await expect(t.query(api.emailPreferences.getMine, {})).rejects.toThrow();
    await expect(
      signedIn.query(api.emailPreferences.getMine, {}),
    ).resolves.toEqual({ frequency: "daily" });
    await signedIn.mutation(api.emailPreferences.updateFrequency, {
      frequency: "never",
    });
    await expect(
      signedIn.query(api.emailPreferences.getMine, {}),
    ).resolves.toEqual({ frequency: "never" });
  });

  it("prepares an email for a new user's first visible matches by default", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "new-candidate@example.com",
        name: "New Candidate",
      });
      const profileRevision = 42;
      await ctx.db.insert("candidateProfiles", {
        userId,
        email: "new-candidate@example.com",
        preferredDisplayName: "New Candidate",
        onboardingCompleted: true,
        onboardingStep: 4,
        createdAt: 1,
        updatedAt: profileRevision,
      });
      const jobId = await ctx.db.insert("jobs", {
        normalizedSourceUrl: "https://careers.example.com/product",
        jobFingerprint: "example-product-tel-aviv",
        contentHash: "content-v1",
        title: "Product Manager",
        companyName: "Example",
        sourceUrl: "https://careers.example.com/product",
        sourceName: "Example Careers",
        sourceType: "employer",
        descriptionText: "Build products.",
        requirementsText: "Product strategy.",
        responsibilities: [],
        requiredSkills: ["Product strategy"],
        preferredSkills: [],
        requiredExperienceYearsMin: null,
        requiredExperienceYearsMax: null,
        educationRequirements: [],
        languages: [],
        country: "Israel",
        city: "Tel Aviv",
        locationText: "Tel Aviv, Israel",
        workArrangement: "hybrid",
        employmentType: "full-time",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        postedAt: null,
        applicationDeadline: null,
        sourceEvidence: [],
        firstDiscoveredAt: now,
        lastDiscoveredAt: now,
        lastVerifiedAt: now,
        activityStatus: "active",
        lifecycleStatus: "verified_active",
      });
      await ctx.db.insert("jobMatches", {
        userId,
        jobId,
        profileRevision,
        displayEligible: true,
        outcome: "eligible",
        exclusionReasons: [],
        relevanceScore: 88,
        scoreComponents: {
          role: 35,
          requiredSkills: 18,
          preferredSkills: 0,
          experience: 10,
          location: 5,
          workArrangement: 0,
          employmentType: 0,
          language: 0,
          education: 0,
          semantic: 0,
        },
        matchReasons: ["target_role"],
        resultSource: "central",
        evaluatedAt: now,
      });
      return userId;
    });

    const delivery = await t.mutation(
      internal.emailPreferences.prepareDelivery,
      {
        userId,
        dayKey: "2026-09-23",
        now,
      },
    );

    expect(delivery).toMatchObject({
      to: "new-candidate@example.com",
      displayName: "New Candidate",
      jobs: [
        {
          title: "Product Manager",
          companyName: "Example",
          location: "Tel Aviv, Israel",
          relevanceScore: 88,
        },
      ],
    });
    expect(delivery?.deliveryKey).toContain(`${userId}/daily:2026-09-23`);
  });

  it("does not email a stale materialized match that fails experience eligibility", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "junior@example.com",
      });
      const profileRevision = 42;
      await ctx.db.insert("candidateProfiles", {
        userId,
        email: "junior@example.com",
        yearsOfExperience: 0,
        onboardingCompleted: true,
        onboardingStep: 4,
        createdAt: 1,
        updatedAt: profileRevision,
      });
      const jobId = await ctx.db.insert("jobs", {
        normalizedSourceUrl: "https://careers.example.com/senior-product",
        jobFingerprint: "senior-product-tel-aviv",
        contentHash: "content-senior",
        title: "Product Manager",
        companyName: "Example",
        sourceUrl: "https://careers.example.com/senior-product",
        sourceName: "Example Careers",
        sourceType: "employer",
        descriptionText: "Lead product strategy.",
        requirementsText: "4-5 years of product management experience.",
        responsibilities: [],
        requiredSkills: ["Product strategy"],
        preferredSkills: [],
        requiredExperienceYearsMin: 4,
        requiredExperienceYearsMax: 5,
        educationRequirements: [],
        languages: [],
        country: "Israel",
        city: "Tel Aviv",
        locationText: "Tel Aviv, Israel",
        workArrangement: "hybrid",
        employmentType: "full-time",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        postedAt: null,
        applicationDeadline: null,
        sourceEvidence: [],
        firstDiscoveredAt: now,
        lastDiscoveredAt: now,
        lastVerifiedAt: now,
        activityStatus: "active",
        lifecycleStatus: "verified_active",
      });
      await ctx.db.insert("jobMatches", {
        userId,
        jobId,
        profileRevision,
        displayEligible: true,
        outcome: "eligible",
        exclusionReasons: [],
        relevanceScore: 88,
        scoreComponents: {
          role: 35,
          requiredSkills: 18,
          preferredSkills: 0,
          experience: 0,
          location: 5,
          workArrangement: 0,
          employmentType: 0,
          language: 0,
          education: 0,
          semantic: 0,
        },
        matchReasons: ["target_role"],
        resultSource: "central",
        evaluatedAt: now,
      });
      return userId;
    });

    await expect(
      t.mutation(internal.emailPreferences.prepareDelivery, {
        userId,
        dayKey: "2026-09-24",
        now,
      }),
    ).resolves.toBeNull();
  });
});

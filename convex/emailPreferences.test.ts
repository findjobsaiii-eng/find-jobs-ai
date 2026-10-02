/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createCandidate(
  t: TestConvex<typeof schema>,
  email: string,
  yearsOfExperience = 5,
) {
  await t.mutation(internal.referenceData.seedCatalog, {});
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email,
      name: "New Candidate",
    });
    const title = await ctx.db
      .query("catalogItems")
      .withIndex("by_source_and_externalId", (q) =>
        q.eq("source", "curated").eq("externalId", "product-manager"),
      )
      .unique();
    const skill = await ctx.db
      .query("catalogItems")
      .withIndex("by_source_and_externalId", (q) =>
        q.eq("source", "curated").eq("externalId", "product-management"),
      )
      .unique();
    await ctx.db.insert("candidateProfiles", {
      userId,
      email,
      preferredDisplayName: "New Candidate",
      targetJobTitleIds: [title!._id],
      skillIds: [skill!._id],
      yearsOfExperience,
      preferredPlaceIds: ["tel-aviv"],
      locationRadiusKm: 30,
      primaryLocation: {
        placeId: "tel-aviv",
        formattedAddress: "Tel Aviv, Israel",
        city: "Tel Aviv",
        country: "Israel",
        countryCode: "IL",
        latitude: 32.0853,
        longitude: 34.7818,
        radiusKm: 30,
      },
      workArrangements: ["hybrid"],
      employmentTypes: ["full-time"],
      onboardingCompleted: true,
      onboardingStep: 4,
      createdAt: 1,
      updatedAt: 42,
    });
    return userId;
  });
}

async function createJob(
  t: TestConvex<typeof schema>,
  args: {
    userId: Id<"users">;
    now: number;
    key?: string;
    partial?: boolean;
    requiredExperience?: number;
    stale?: boolean;
  },
) {
  const jobId = await t.run(async (ctx) => {
    const url = `https://careers.example.com/${args.key ?? "product"}`;
    const jobId = await ctx.db.insert("jobs", {
      normalizedSourceUrl: url,
      jobFingerprint: `${args.key ?? "product"}-tel-aviv`,
      contentHash: `content-${args.key ?? "product"}`,
      title: "Product Manager",
      companyName: args.key ?? "Example",
      sourceUrl: url,
      sourceName: "Example Careers",
      sourceType: "employer",
      descriptionText: "Build products.",
      requirementsText: "Product management.",
      responsibilities: [],
      requiredSkills: args.partial
        ? ["Product Management", "SQL", "Unconfirmed custom skill"]
        : ["Product Management"],
      preferredSkills: [],
      requiredExperienceYearsMin: args.requiredExperience ?? null,
      requiredExperienceYearsMax: null,
      educationRequirements: [],
      languages: [],
      country: "Israel",
      city: "Tel Aviv",
      geo: {
        placeId: "tel-aviv",
        countryCode: "IL",
        latitude: 32.0853,
        longitude: 34.7818,
        precision: "locality_centroid",
      },
      locationText: "Tel Aviv, Israel",
      workArrangement: "hybrid",
      employmentType: "full-time",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      postedAt: new Date(args.now).toISOString(),
      applicationDeadline: null,
      sourceEvidence: [],
      firstDiscoveredAt: args.now,
      lastDiscoveredAt: args.now,
      lastVerifiedAt: args.now,
      activityStatus: "active",
      lifecycleStatus: "verified_active",
    });
    const sourceId = await ctx.db.insert("jobSources", {
      jobId,
      sourceUrl: url,
      normalizedUrl: url,
      finalUrl: url,
      domain: "careers.example.com",
      sourceTier: "employer",
      firstSeenAt: args.now,
      lastSeenAt: args.now,
      lastVerifiedAt: args.now,
      activityStatus: "verified_active",
      activeEvidenceType: "active_application_flow",
    });
    await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
    return jobId;
  });
  await t.mutation(internal.jobMatching.reconcileUserJob, {
    userId: args.userId,
    jobId,
  });
  if (args.stale)
    await t.run((ctx) =>
      ctx.db.insert("jobMatches", {
        userId: args.userId,
        jobId,
        profileRevision: 42,
        displayEligible: true,
        matchQuality: "strong",
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
        evaluatedAt: args.now,
      }),
    );
  return jobId;
}

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
    const userId = await createCandidate(t, "new-candidate@example.com");
    await createJob(t, { userId, now });

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
          relevanceScore: expect.any(Number),
        },
      ],
    });
    expect(delivery?.deliveryKey).toContain(`${userId}/daily:2026-09-23`);
  });

  it("does not email a stale materialized match that fails experience eligibility", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await createCandidate(t, "junior@example.com", 0);
    await createJob(t, { userId, now, requiredExperience: 4, stale: true });

    await expect(
      t.mutation(internal.emailPreferences.prepareDelivery, {
        userId,
        dayKey: "2026-09-24",
        now,
      }),
    ).resolves.toBeNull();
  });

  it("emails only strong matches when five exist and adds a near-match when the inventory falls below five", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await createCandidate(t, "inventory@example.com");
    const strongIds: Id<"jobs">[] = [];
    for (let index = 0; index < 5; index += 1) {
      strongIds.push(
        await createJob(t, { userId, now, key: `strong-${index}` }),
      );
    }
    const partialId = await createJob(t, {
      userId,
      now,
      key: "near-match",
      partial: true,
    });
    const partition = await t.run((ctx) =>
      ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", partialId),
        )
        .unique(),
    );
    expect(partition?.matchQuality).toBe("partial");
    const first = await t.mutation(internal.emailPreferences.prepareDelivery, {
      userId,
      dayKey: "2026-10-01",
      now,
    });
    expect(first?.jobs).toHaveLength(5);
    expect(
      first?.jobs.every((job) => job.companyName.startsWith("strong-")),
    ).toBe(true);

    await t.mutation(internal.emailPreferences.finishDelivery, {
      userId,
      deliveryKey: first!.deliveryKey,
      sent: false,
      now,
    });
    await t.run(async (ctx) => {
      const match = await ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", strongIds[0]),
        )
        .unique();
      await ctx.db.delete("jobMatches", match!._id);
    });
    const second = await t.mutation(internal.emailPreferences.prepareDelivery, {
      userId,
      dayKey: "2026-10-02",
      now,
    });
    expect(second?.jobs).toHaveLength(5);
    expect(
      second?.jobs
        .slice(0, 4)
        .every((job) => job.companyName.startsWith("strong-")),
    ).toBe(true);
    expect(second?.jobs[4].companyName).toBe("near-match");
  });
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildSearchPlan, normalizeJob } from "./jobDiscoveryModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
}

async function createUser(t: TestConvex<typeof schema>) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "candidate@example.com",
      name: "Candidate",
    }),
  );
}

const searchProfile = {
  targetJobTitles: ["Frontend Engineer", "QA Engineer"],
  skills: ["React", "TypeScript"],
  yearsOfExperience: 7,
  location: {
    placeId: "place-tel-aviv",
    formattedAddress: "Tel Aviv-Yafo, Israel",
    city: "Tel Aviv-Yafo",
    administrativeArea: "Tel Aviv District",
    country: "Israel",
    countryCode: "IL",
    latitude: 32.0853,
    longitude: 34.7818,
    radiusKm: 25,
  },
  workArrangements: ["hybrid", "remote"],
  employmentTypes: ["full-time"],
  languages: [{ languageCode: "en", proficiency: "fluent" }],
  minimumMonthlySalaryIls: 20_000,
};

const runtime = {
  enabled: true,
  globalDailyRunLimit: 20,
  globalDailyQueryLimit: 30,
  maxConcurrentRuns: 3,
  outputTokenLimit: 2_000,
};

function beginArgs(userId: Id<"users">, fingerprint: string, manual = false) {
  return {
    userId,
    fingerprint,
    normalizedCriteria: fingerprint,
    generatedQueries: [`${fingerprint} jobs`],
    model: "test-model",
    manual,
    runtime,
  };
}

async function setPlan(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  plan: "free" | "pro",
) {
  await t.run((ctx) =>
    ctx.db.insert("userEntitlements", {
      userId,
      plan,
      active: true,
      source: "manual",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function addCompletedProfile(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
) {
  await t.run(async (ctx) => {
    const titleId = await ctx.db.insert("catalogItems", {
      kind: "jobTitle",
      labelEn: "Frontend Engineer",
      normalizedKey: "frontend engineer",
      normalizedLabels: ["frontend engineer"],
      searchText: "frontend engineer",
      visibility: "public",
      source: "curated",
      priority: 1,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const skillId = await ctx.db.insert("catalogItems", {
      kind: "skill",
      labelEn: "React",
      normalizedKey: "react",
      normalizedLabels: ["react"],
      searchText: "react",
      visibility: "public",
      source: "curated",
      priority: 1,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("candidateProfiles", {
      userId,
      email: "candidate@example.com",
      targetJobTitleIds: [titleId],
      skillIds: [skillId],
      yearsOfExperience: searchProfile.yearsOfExperience,
      preferredPlaceIds: [searchProfile.location.placeId],
      locationRadiusKm: searchProfile.location.radiusKm,
      primaryLocation: searchProfile.location,
      workArrangements: ["hybrid", "remote"],
      employmentTypes: ["full-time"],
      languages: [{ languageCode: "en", proficiency: "fluent" }],
      minimumMonthlySalaryIls: searchProfile.minimumMonthlySalaryIls,
      onboardingStep: 4,
      onboardingCompleted: true,
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    });
  });
}

const rawJob = {
  title: "Frontend Engineer",
  companyName: "Example Company",
  sourceUrl: "https://careers.example.com/jobs/role-1",
  sourceName: "Example Careers",
  sourceType: "employer" as const,
  descriptionText: "Build accessible React interfaces in Tel Aviv.",
  requirementsText: "Five years of frontend experience.",
  responsibilities: ["Build interfaces"],
  requiredSkills: ["React", "TypeScript"],
  preferredSkills: [],
  requiredExperienceYearsMin: 5,
  requiredExperienceYearsMax: 10,
  educationRequirements: [],
  languages: ["English"],
  country: "Israel",
  city: "Tel Aviv",
  locationText: "Tel Aviv, Israel",
  workArrangement: "hybrid" as const,
  employmentType: "full-time" as const,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  postedAt: null,
  applicationDeadline: null,
  workAuthorizationRequirements: null,
  sourceEvidence: [
    {
      url: "https://careers.example.com/jobs/role-1",
      title: "Frontend Engineer",
      excerpt: "Example Company is hiring",
    },
  ],
};

function normalizedJob() {
  const job = normalizeJob(rawJob, new Set([rawJob.sourceUrl]));
  if (!job) throw new Error("Test job did not normalize");
  return job;
}

function verification() {
  return {
    activityStatus: "verified_active" as const,
    finalUrl: rawJob.sourceUrl,
    domain: "careers.example.com",
    sourceTier: "employer" as const,
    externalJobId: "role-1",
    verifiedAt: Date.now(),
    verificationMethod: "http_content_v1" as const,
    verificationEvidence: "Expected role and company confirmed",
    rawSourceText: "Original public posting text",
  };
}

describe("shared job discovery", () => {
  it("returns central-only for free users without provider configuration", async () => {
    vi.stubEnv("DEV_TOOLS_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_JOB_SEARCH_MODEL", "");
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const result = await asUser(t, userId).action(
      api.jobDiscoveryActions.discoverJobsForCurrentUser,
      {},
    );
    expect(result).toMatchObject({
      plan: "free",
      resultSource: "central",
      generatedQueryCount: 0,
      webSearchToolCallCount: 0,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobSearchRuns").collect()).toHaveLength(0);
      expect(await ctx.db.query("jobSearchUsage").collect()).toHaveLength(0);
    });
  });

  it("shares one daily query claim between paid users", async () => {
    const t = convexTest(schema, modules);
    const firstUser = await createUser(t);
    const secondUser = await createUser(t);
    await setPlan(t, firstUser, "pro");
    await setPlan(t, secondUser, "pro");
    expect(
      await t.mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs(firstUser, "frontend-tel-aviv"),
      ),
    ).not.toBeNull();
    expect(
      await t.mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs(secondUser, "frontend-tel-aviv"),
      ),
    ).toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobSearchRuns").collect()).toHaveLength(1);
    });
  });

  it("releases a failed daily claim for another paid user", async () => {
    const t = convexTest(schema, modules);
    const firstUser = await createUser(t);
    const secondUser = await createUser(t);
    await setPlan(t, firstUser, "pro");
    await setPlan(t, secondUser, "pro");
    const first = await t.mutation(
      internal.jobDiscovery.beginSearch,
      beginArgs(firstUser, "qa-tel-aviv"),
    );
    if (!first) throw new Error("Expected reservation");
    await t.mutation(internal.jobDiscovery.failSearch, {
      userId: firstUser,
      runId: first.runId,
      reservationId: first.reservationId,
      errorCategory: "provider_failure",
    });
    expect(
      await t.mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs(secondUser, "qa-tel-aviv"),
      ),
    ).not.toBeNull();
  });

  it("allows repeated manual paid searches without daily or global limits", async () => {
    vi.stubEnv("DEV_TOOLS_ENABLED", "true");
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await setPlan(t, userId, "pro");
    for (let index = 0; index < 2; index += 1) {
      const run = await t.mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs(userId, "manual-query", true),
      );
      if (!run) throw new Error("Expected manual reservation");
      await t.mutation(internal.jobDiscovery.failSearch, {
        userId,
        runId: run.runId,
        reservationId: run.reservationId,
        errorCategory: "test_finished",
      });
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobSearchRuns").collect()).toHaveLength(2);
      expect(await ctx.db.query("jobSearchGlobalUsage").collect()).toHaveLength(
        0,
      );
    });
  });

  it("persists raw and structured data while deduplicating", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await setPlan(t, userId, "pro");
    const run = await t.mutation(
      internal.jobDiscovery.beginSearch,
      beginArgs(userId, "persist-job"),
    );
    if (!run) throw new Error("Expected reservation");
    await t.mutation(internal.jobDiscovery.completeSearch, {
      userId,
      runId: run.runId,
      reservationId: run.reservationId,
      returnedCandidateCount: 2,
      rejectedCount: 0,
      webSearchToolCallCount: 1,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      profile: searchProfile,
      jobs: [
        { job: normalizedJob(), verification: verification() },
        { job: normalizedJob(), verification: verification() },
      ],
    });
    await t.run(async (ctx) => {
      const jobs = await ctx.db.query("jobs").collect();
      const sources = await ctx.db.query("jobSources").collect();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].rawProviderJson).toContain("Frontend Engineer");
      expect(jobs[0].geo).toMatchObject({
        countryCode: "IL",
        precision: "locality_centroid",
      });
      expect(sources).toHaveLength(1);
      expect(sources[0].rawSourceText).toBe("Original public posting text");
    });
  });

  it("shows matching central jobs to free users and excludes unresolved locations", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [index, geo] of [normalizedJob().geo, undefined].entries()) {
        const job = normalizedJob();
        const { geo: _storedGeo, ...jobWithoutGeo } = job;
        const jobId = await ctx.db.insert("jobs", {
          ...jobWithoutGeo,
          ...(geo ? { geo } : {}),
          normalizedSourceUrl: `${job.normalizedSourceUrl}-${index}`,
          sourceUrl: `${job.sourceUrl}-${index}`,
          jobFingerprint: `${job.jobFingerprint}-${index}`,
          contentHash: `${job.contentHash}-${index}`,
          firstDiscoveredAt: now,
          lastDiscoveredAt: now,
          lastVerifiedAt: now,
          activityStatus: "active",
          lifecycleStatus: "verified_active",
        });
        const sourceId = await ctx.db.insert("jobSources", {
          jobId,
          sourceUrl: `${job.sourceUrl}-${index}`,
          normalizedUrl: `${job.normalizedSourceUrl}-${index}`,
          finalUrl: `${job.sourceUrl}-${index}`,
          domain: "careers.example.com",
          sourceTier: "employer",
          firstSeenAt: now,
          lastSeenAt: now,
          lastVerifiedAt: now,
          activityStatus: "verified_active",
        });
        await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
      }
    });
    const feed = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    expect(feed.jobs).toHaveLength(1);
    expect(feed.jobs[0].title).toBe("Frontend Engineer");
  });

  it("creates one deterministic query per target role, up to five", () => {
    const plan = buildSearchPlan({
      ...searchProfile,
      targetJobTitles: ["QA Engineer", "Frontend Engineer", "QA Engineer"],
    });
    expect(plan.generatedQueries).toHaveLength(2);
    expect(plan.generatedQueries.join(" ")).toContain("Frontend Engineer");
    expect(plan.generatedQueries.join(" ")).toContain("QA Engineer");
  });
});

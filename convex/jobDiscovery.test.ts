/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildSearchPlan,
  normalizeJob,
  normalizePublicUrl,
  normalizeTitleIdentity,
} from "./jobDiscoveryModel";
import type { OpenAIJob } from "./jobDiscoveryModel";
import type { SourceVerification } from "./jobSourceVerification";
import {
  MINIMUM_RELEVANCE_SCORE,
  PARTIAL_MATCH_MINIMUM_SCORE,
} from "./jobQuality";
import { globalDayKey } from "./jobSearchPolicy";
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
      labelHe: "מפתח Frontend",
      aliases: ["Front-end Developer", "מפתח פרונטאנד"],
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

const rawJob: OpenAIJob = {
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

function verification(): SourceVerification {
  return {
    activityStatus: "verified_active" as const,
    finalUrl: rawJob.sourceUrl,
    domain: "careers.example.com",
    sourceTier: "employer" as const,
    externalJobId: "role-1",
    verifiedAt: Date.now(),
    verificationMethod: "http_content_v2" as const,
    verificationEvidence: "active_application_flow",
    activeEvidenceType: "active_application_flow",
    identityMatched: true,
    applicationAvailable: true,
    structuredDatePosted: null,
    structuredValidThrough: null,
    structuredJobIdentifier: null,
    pageTitle: "Frontend Engineer - Example Company",
    redirected: false,
    rawSourceText: "Original public posting text",
  };
}

function normalizeCandidate(candidate: typeof rawJob) {
  const sourceUrl = normalizePublicUrl(candidate.sourceUrl);
  if (!sourceUrl) throw new Error("Invalid test URL");
  const job = normalizeJob(candidate, new Set([sourceUrl]));
  if (!job) throw new Error("Test job did not normalize");
  return job;
}

async function ingestCandidates(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  candidates: Array<{
    job: ReturnType<typeof normalizeCandidate>;
    verification: ReturnType<typeof verification>;
  }>,
) {
  await setPlan(t, userId, "pro");
  const run = await t.mutation(
    internal.jobDiscovery.beginSearch,
    beginArgs(userId, `dedupe-${Math.random()}`),
  );
  if (!run) throw new Error("Expected reservation");
  return await t.mutation(internal.jobDiscovery.completeSearch, {
    userId,
    runId: run.runId,
    reservationId: run.reservationId,
    returnedCandidateCount: candidates.length,
    rejectedCount: 0,
    webSearchToolCallCount: 1,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    profile: searchProfile,
    jobs: candidates,
  });
}

describe("shared job discovery", () => {
  it("loads persisted aliases for curated target roles", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);
    const profile = await t.query(
      internal.jobDiscovery.getCurrentSearchProfile,
      { userId },
    );
    expect(profile.targetRoleVariants).toEqual([
      {
        title: "Frontend Engineer",
        aliases: ["מפתח Frontend", "Front-end Developer", "מפתח פרונטאנד"],
      },
    ]);
  });

  it("returns central-only for free users without provider configuration", async () => {
    vi.stubEnv("DEV_TOOLS_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_JOB_SEARCH_MODEL", "");
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await setPlan(t, userId, "free");
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

  it("allows a same-day query retry when the previous search produced no visible jobs", async () => {
    const t = convexTest(schema, modules);
    const firstUser = await createUser(t);
    const secondUser = await createUser(t);
    await setPlan(t, firstUser, "pro");
    await setPlan(t, secondUser, "pro");
    const first = await t.mutation(
      internal.jobDiscovery.beginSearch,
      beginArgs(firstUser, "empty-frontend-tel-aviv"),
    );
    if (!first) throw new Error("Expected reservation");
    await t.mutation(internal.jobDiscovery.completeSearch, {
      userId: firstUser,
      runId: first.runId,
      reservationId: first.reservationId,
      returnedCandidateCount: 0,
      rejectedCount: 0,
      webSearchToolCallCount: 2,
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      providerDiagnostics: {
        responseStatus: "completed",
        parsed: true,
        outputTextExcerpt: '{"jobs":[]}',
        rawResponseExcerpt: '{"status":"completed"}',
      },
      profile: searchProfile,
      jobs: [],
    });

    expect(
      await t.mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs(secondUser, "empty-frontend-tel-aviv"),
      ),
    ).not.toBeNull();
    await t.run(async (ctx) => {
      const completed = await ctx.db.get("jobSearchRuns", first.runId);
      expect(completed?.providerDiagnostics).toMatchObject({
        responseStatus: "completed",
        parsed: true,
      });
    });
  });

  it("treats a user without an entitlement as Pro during the pilot", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    expect(
      await t.query(internal.jobDiscovery.getUserPlan, {
        userId,
        now: Date.now(),
      }),
    ).toBe("pro");
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
      providerDiagnostics: {
        responseId: "resp_failed",
        responseStatus: "incomplete",
        parsed: false,
        incompleteReason: "max_output_tokens",
        rawResponseExcerpt: '{"status":"incomplete"}',
      },
    });
    expect(
      await t.mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs(secondUser, "qa-tel-aviv"),
      ),
    ).not.toBeNull();
    await t.run(async (ctx) => {
      const failed = await ctx.db.get("jobSearchRuns", first.runId);
      expect(failed?.providerDiagnostics).toMatchObject({
        responseId: "resp_failed",
        parsed: false,
        incompleteReason: "max_output_tokens",
      });
    });
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

  it("returns strong and partial matches in score order while preserving hard location exclusions", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("DEV_TOOLS_ENABLED", "true");
    const userId = await createUser(t);
    await setPlan(t, userId, "free");
    await addCompletedProfile(t, userId);
    await t.run(async (ctx) => {
      const now = Date.now();
      const baseJob = normalizedJob();
      const variants = [
        { title: "Frontend Engineer", geo: baseJob.geo },
        { title: "Frontend Content Specialist", geo: baseJob.geo },
        { title: "Frontend Engineer", geo: undefined },
      ];
      for (const [index, variant] of variants.entries()) {
        const job = normalizedJob();
        const { geo: _storedGeo, ...jobWithoutGeo } = job;
        const jobId = await ctx.db.insert("jobs", {
          ...jobWithoutGeo,
          title: variant.title,
          ...(variant.title === "Frontend Content Specialist"
            ? {
                descriptionText: "Maintain content in a React website",
                requiredSkills: ["CMS"],
                preferredSkills: [],
              }
            : {}),
          ...(variant.geo ? { geo: variant.geo } : {}),
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
          activeEvidenceType: "active_application_flow",
        });
        await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
      }
    });
    await t.mutation(internal.jobMatching.reconcileUserPage, {
      userId,
      lifecycleStatus: "verified_active",
      cursor: null,
    });
    const feed = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    const audit = await asUser(t, userId).query(
      api.jobDiscovery.getCurrentUserMatchAudit,
      {},
    );
    const developmentFeed = await t.query(
      internal.jobDiscovery.listUserJobsForDevelopment,
      { userId },
    );
    expect(feed.jobs).toHaveLength(2);
    expect(feed.jobs[0].title).toBe("Frontend Engineer");
    expect(feed.jobs[0].locationNames).toEqual({
      en: "Tel Aviv",
      he: "תל אביב-יפו",
    });
    expect(feed.jobs[0].relevanceScore).toBeGreaterThanOrEqual(
      MINIMUM_RELEVANCE_SCORE,
    );
    expect(feed.jobs[0].matchQuality).toBe("strong");
    expect(feed.jobs[1].title).toBe("Frontend Content Specialist");
    expect(feed.jobs[1].relevanceScore).toBeGreaterThanOrEqual(
      PARTIAL_MATCH_MINIMUM_SCORE,
    );
    expect(feed.jobs[1].relevanceScore).toBeLessThan(MINIMUM_RELEVANCE_SCORE);
    expect(feed.jobs[1].matchQuality).toBe("partial");
    expect(feed.jobs[0].relevanceScore).toBeGreaterThan(
      feed.jobs[1].relevanceScore,
    );
    expect(audit.counts.displayed).toBe(feed.jobs.length);
    expect(developmentFeed.map((item) => item.id)).toEqual(
      feed.jobs.map((item) => item.id),
    );
    expect(audit.counts.strongMatches).toBe(1);
    expect(audit.counts.partialMatches).toBe(1);
    expect(feed.jobs[0].scoreComponents?.role).toBeGreaterThan(0);
    expect(feed.jobs[0].scoreComponents?.requiredSkills).toBeGreaterThan(0);
    expect(feed.jobs[0].scoreComponents?.location).toBe(5);
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

  it("searches controlled role aliases in one compact national query", () => {
    const plan = buildSearchPlan({
      ...searchProfile,
      targetJobTitles: ["Software Engineer"],
      targetRoleVariants: [
        {
          title: "Software Engineer",
          aliases: ["מהנדס תוכנה", "Software Developer", "מפתח תוכנה"],
        },
      ],
      skills: ["React", "Node.js", "management"],
    });
    expect(plan.generatedQueries).toHaveLength(1);
    expect(plan.generatedQueries[0]).toContain("Software Engineer");
    expect(plan.generatedQueries[0]).toContain("מהנדס תוכנה");
    expect(plan.generatedQueries[0]).toContain("vacancies in Israel");
    expect(plan.generatedQueries[0]).toContain("employer or ATS");
    expect(plan.generatedQueries[0]).not.toContain('"management"');
    expect(plan.generatedQueries[0]).not.toContain('"React"');
  });

  it("adds controlled bilingual discovery aliases without changing the profile", () => {
    const plan = buildSearchPlan({
      ...searchProfile,
      targetJobTitles: ["מיישם CRM ואוטומציות"],
      targetRoleVariants: [],
    });
    expect(plan.generatedQueries[0]).toContain("CRM Automation Specialist");
    expect(plan.generatedQueries[0]).toContain("מיישם/ת CRM");
  });

  it("shares national discovery across user radii and Israeli locations", () => {
    const district = buildSearchPlan({
      ...searchProfile,
      location: { ...searchProfile.location, radiusKm: 60 },
    });
    const country = buildSearchPlan({
      ...searchProfile,
      location: { ...searchProfile.location, radiusKm: 100 },
    });
    const south = buildSearchPlan({
      ...searchProfile,
      location: {
        ...searchProfile.location,
        formattedAddress: "Netivot, Israel",
        city: "Netivot",
        administrativeArea: "South District",
        latitude: 31.423,
        longitude: 34.589,
        radiusKm: 60,
      },
    });
    expect(district.generatedQueries).toEqual(country.generatedQueries);
    expect(south.generatedQueries).toEqual(country.generatedQueries);
    expect(district.queryPlans.map((query) => query.fingerprint)).toEqual(
      country.queryPlans.map((query) => query.fingerprint),
    );
    expect(south.queryPlans.map((query) => query.fingerprint)).toEqual(
      country.queryPlans.map((query) => query.fingerprint),
    );
  });

  it("keeps search sharing identity stable across localized place labels", () => {
    const english = buildSearchPlan(searchProfile);
    const hebrew = buildSearchPlan({
      ...searchProfile,
      location: {
        ...searchProfile.location,
        formattedAddress: "תל אביב-יפו, ישראל",
        city: "תל אביב-יפו",
        country: "ישראל",
      },
    });
    expect(hebrew.queryPlans.map((query) => query.fingerprint)).toEqual(
      english.queryPlans.map((query) => query.fingerprint),
    );
    expect(hebrew.generatedQueries).toEqual(english.generatedQueries);
  });

  it("reconciles active jobs beyond one bounded catalog page", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);
    await t.run(async (ctx) => {
      for (let index = 0; index < 33; index += 1) {
        const job = normalizedJob();
        const now = Date.now() + index;
        const jobId = await ctx.db.insert("jobs", {
          ...job,
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
          activeEvidenceType: "active_application_flow",
        });
        await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
      }
    });
    await t.mutation(internal.jobMatching.reconcileUserPage, {
      userId,
      lifecycleStatus: "verified_active",
      cursor: null,
    });
    const continuation = await t.run(async (ctx) => {
      expect(await ctx.db.query("jobMatches").collect()).toHaveLength(32);
      const scheduled = await ctx.db.system
        .query("_scheduled_functions")
        .collect();
      return scheduled.find(
        (item) =>
          (item.args[0] as { lifecycleStatus?: string }).lifecycleStatus ===
          "verified_active",
      )?.args[0] as {
        cursor: string;
        expectedProfileRevision: number;
      };
    });
    expect(continuation.cursor).toBeTruthy();
    await t.mutation(internal.jobMatching.reconcileUserPage, {
      userId,
      lifecycleStatus: "verified_active",
      cursor: continuation.cursor,
      expectedProfileRevision: continuation.expectedProfileRevision,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobMatches").collect()).toHaveLength(33);
    });
  });
});

describe("canonical job identity", () => {
  it("merges identical URLs", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      { job: normalizedJob(), verification: verification() },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(1);
    });
  });

  it("removes tracking, referral, session, fragments, and query ordering", () => {
    expect(
      normalizePublicUrl(
        "https://www.example.com/jobs/42/?b=2&utm_source=x&ref=mail&sessionId=abc&a=1#apply",
      ),
    ).toBe("https://example.com/jobs/42?a=1&b=2");
  });

  it("merges tracked URL variants during ingestion", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const tracked = normalizeCandidate({
      ...rawJob,
      sourceUrl:
        "https://careers.example.com/jobs/role-1?utm_source=mail&ref=friend&sessionId=abc#apply",
      sourceEvidence: [
        {
          url: "https://careers.example.com/jobs/role-1?utm_source=mail&ref=friend&sessionId=abc#apply",
          title: rawJob.title,
          excerpt: "Example Company is hiring",
        },
      ],
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      {
        job: tracked,
        verification: {
          ...verification(),
          finalUrl: tracked.sourceUrl,
        },
      },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(1);
      expect(await ctx.db.query("jobSources").collect()).toHaveLength(1);
    });
  });

  it("normalizes common e-commerce title formatting without removing seniority", () => {
    expect(normalizeTitleIdentity("eCommerce Manager")).toBe(
      normalizeTitleIdentity("E-Commerce Manager"),
    );
    expect(normalizeTitleIdentity("Ecommerce Manager")).toBe(
      normalizeTitleIdentity("E-Commerce Manager"),
    );
    expect(normalizeTitleIdentity("Senior Product Manager")).not.toBe(
      normalizeTitleIdentity("Product Manager"),
    );
  });

  it("merges different URLs with the same provider job ID", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const second = normalizeCandidate({
      ...rawJob,
      sourceUrl: "https://careers.example.com/openings/frontend",
      sourceEvidence: [
        {
          url: "https://careers.example.com/openings/frontend",
          title: rawJob.title,
          excerpt: "Example Company is hiring",
        },
      ],
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      {
        job: second,
        verification: {
          ...verification(),
          finalUrl: second.sourceUrl,
          externalJobId: "role-1",
        },
      },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(1);
      expect(await ctx.db.query("jobSources").collect()).toHaveLength(1);
    });
  });

  it("keeps a provider repost with a new job ID separate even when content is unchanged", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const repost = normalizeCandidate({
      ...rawJob,
      sourceUrl: "https://careers.example.com/jobs/role-2",
      sourceEvidence: [
        {
          url: "https://careers.example.com/jobs/role-2",
          title: rawJob.title,
          excerpt: "Example Company is hiring",
        },
      ],
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      {
        job: repost,
        verification: {
          ...verification(),
          finalUrl: repost.sourceUrl,
          externalJobId: "role-2",
        },
      },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(2);
      expect(await ctx.db.query("jobSources").collect()).toHaveLength(2);
    });
  });

  it("merges equivalent company, title, and Israeli location across providers", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const repost = normalizeCandidate({
      ...rawJob,
      title: "Front-End Engineer",
      companyName: "Example Company Ltd.",
      sourceUrl: "https://jobs.example.net/listing/98765",
      sourceName: "Example Jobs",
      sourceType: "job_board",
      city: "תל אביב",
      locationText: "תל אביב, ישראל",
      sourceEvidence: [
        {
          url: "https://jobs.example.net/listing/98765",
          title: "Front-End Engineer",
          excerpt: "Example Company is hiring",
        },
      ],
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      {
        job: repost,
        verification: {
          ...verification(),
          finalUrl: repost.sourceUrl,
          domain: "jobs.example.net",
          sourceTier: "job_board",
          externalJobId: "98765",
        },
      },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(1);
      expect(await ctx.db.query("jobSources").collect()).toHaveLength(2);
      expect(await ctx.db.query("jobIngestionEvents").collect()).toHaveLength(
        2,
      );
    });
  });

  it("keeps senior and non-senior roles separate", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const senior = normalizeCandidate({
      ...rawJob,
      title: "Senior Frontend Engineer",
      sourceUrl: "https://careers.example.com/jobs/role-2",
      sourceEvidence: [
        {
          url: "https://careers.example.com/jobs/role-2",
          title: "Senior Frontend Engineer",
          excerpt: "Example Company is hiring",
        },
      ],
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      {
        job: senior,
        verification: {
          ...verification(),
          finalUrl: senior.sourceUrl,
          externalJobId: "role-2",
        },
      },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(2);
    });
  });

  it("keeps the same company and role in different cities separate", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const haifa = normalizeCandidate({
      ...rawJob,
      city: "Haifa",
      locationText: "Haifa, Israel",
      sourceUrl: "https://careers.example.com/jobs/role-haifa",
      sourceEvidence: [
        {
          url: "https://careers.example.com/jobs/role-haifa",
          title: rawJob.title,
          excerpt: "Example Company is hiring",
        },
      ],
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
      {
        job: haifa,
        verification: {
          ...verification(),
          finalUrl: haifa.sourceUrl,
          externalJobId: "role-haifa",
        },
      },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(2);
    });
  });
});

describe("stored job activity", () => {
  it("repairs missing lifecycle and best-source links for existing verified sources", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    await t.run(async (ctx) => {
      const job = await ctx.db.query("jobs").first();
      if (!job) throw new Error("Expected job");
      await ctx.db.patch("jobs", job._id, {
        lifecycleStatus: "unknown",
        activityStatus: "unknown",
        bestSourceId: undefined,
        lastVerifiedAt: undefined,
      });
    });

    await t.mutation(internal.jobActivity.backfillMissingSourceRecords, {
      limit: 25,
    });
    await t.run(async (ctx) => {
      const job = await ctx.db.query("jobs").unique();
      const source = await ctx.db.query("jobSources").unique();
      if (!source) throw new Error("Expected source");
      expect(job).toMatchObject({
        lifecycleStatus: "verified_active",
        activityStatus: "active",
        bestSourceId: source._id,
      });
    });
  });

  it("persists alternate provider evidence URLs as pending sources", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const alternateUrl = "https://boards.example.net/jobs/role-1";
    const candidate = {
      ...rawJob,
      sourceEvidence: [
        ...rawJob.sourceEvidence,
        {
          url: alternateUrl,
          title: rawJob.title,
          excerpt: "Example Company is hiring",
        },
      ],
    };
    const job = normalizeJob(
      candidate,
      new Set([rawJob.sourceUrl, alternateUrl]),
    );
    if (!job) throw new Error("Expected normalized job");
    await ingestCandidates(t, userId, [{ job, verification: verification() }]);
    await t.run(async (ctx) => {
      const sources = await ctx.db.query("jobSources").collect();
      expect(sources).toHaveLength(2);
      expect(
        sources.find((source) => source.normalizedUrl === alternateUrl),
      ).toMatchObject({
        activityStatus: "pending_verification",
        verificationEvidence: "provider_recently_seen_unverified",
      });
    });
  });

  it("idempotently recovers a legacy canonical URL without trusting it as verified", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    await t.run(async (ctx) => {
      const source = await ctx.db.query("jobSources").first();
      if (!source) throw new Error("Expected source");
      await ctx.db.delete("jobSources", source._id);
    });
    const first = await t.mutation(
      internal.jobActivity.backfillMissingSourceRecords,
      { limit: 25 },
    );
    const second = await t.mutation(
      internal.jobActivity.backfillMissingSourceRecords,
      { limit: 25 },
    );
    expect(first).toMatchObject({ recoveredJobs: 1, recoveredSources: 1 });
    expect(second).toMatchObject({ recoveredJobs: 0, recoveredSources: 0 });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobSources").first()).toMatchObject({
        activityStatus: "pending_verification",
        verificationEvidence: "recovered_stored_source_unverified",
      });
      expect(await ctx.db.query("jobs").first()).toMatchObject({
        lifecycleStatus: "unknown",
        activityReason: "provider_recently_seen_unverified",
      });
    });
  });

  it("updates lastSeenAt and retains an ingestion event on a fresh provider sighting", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    await t.run(async (ctx) => {
      const source = await ctx.db.query("jobSources").first();
      if (!source) throw new Error("Expected source");
      await ctx.db.patch("jobSources", source._id, { lastSeenAt: 1 });
    });
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    await t.run(async (ctx) => {
      const source = await ctx.db.query("jobSources").first();
      expect(source?.lastSeenAt).toBeGreaterThan(1);
      expect(await ctx.db.query("jobIngestionEvents").collect()).toHaveLength(
        2,
      );
    });
  });

  it("retains active state after a temporary verification failure", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    const sourceId = await t.run(
      async (ctx) => (await ctx.db.query("jobSources").first())?._id,
    );
    if (!sourceId) throw new Error("Expected source");
    await t.mutation(internal.jobActivity.recordVerification, {
      sourceId,
      verification: {
        ...verification(),
        activityStatus: "verification_failed",
        verificationEvidence: "Temporary HTTP 500",
      },
    });
    await t.run(async (ctx) => {
      const source = await ctx.db.get("jobSources", sourceId);
      const job = await ctx.db.query("jobs").first();
      expect(source).toMatchObject({
        activityStatus: "verified_active",
        verificationFailureCount: 1,
        verificationEvidence: "Temporary HTTP 500",
      });
      expect(job?.lifecycleStatus).toBe("verified_active");
    });
  });

  it("hides closed jobs from suggestions but keeps application history", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    const ids = await t.run(async (ctx) => ({
      jobId: (await ctx.db.query("jobs").first())?._id,
      sourceId: (await ctx.db.query("jobSources").first())?._id,
    }));
    if (!ids.jobId || !ids.sourceId) throw new Error("Expected stored job");
    await asUser(t, userId).mutation(api.jobDiscovery.updateJobTracking, {
      jobId: ids.jobId,
      status: "applied",
    });
    await t.mutation(internal.jobActivity.recordVerification, {
      sourceId: ids.sourceId,
      verification: {
        ...verification(),
        activityStatus: "inactive",
        verificationEvidence: "HTTP 410",
      },
    });
    const suggestions = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    const history = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "inProgress" },
    );
    expect(suggestions.jobs).toHaveLength(0);
    expect(history.jobs).toHaveLength(1);
    expect(history.jobs[0].unavailable).toBe(true);
    await t.run(async (ctx) => {
      expect(await ctx.db.get("jobs", ids.jobId!)).toMatchObject({
        lifecycleStatus: "closed",
        activityReason: "HTTP 410",
      });
    });
  });

  it("saves once, updates status and bounded notes, and preserves appliedAt", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("jobs").first())?._id,
    );
    if (!jobId) throw new Error("Expected stored job");
    const user = asUser(t, userId);

    await user.mutation(api.jobDiscovery.updateJobTracking, {
      jobId,
      status: "saved",
      note: "  Follow up with Dana on Thursday.  ",
    });
    const savedFeed = await user.query(api.jobDiscovery.listCurrentUserJobs, {
      view: "inProgress",
    });
    expect(savedFeed.jobs[0]).toMatchObject({
      id: jobId,
      trackingStatus: "saved",
      trackingTimeline: [
        {
          kind: "status_change",
          status: "saved",
          note: "Follow up with Dana on Thursday.",
        },
      ],
    });
    await t.run(async (ctx) => {
      const saved = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", jobId),
        )
        .unique();
      expect(saved?.appliedAt).toBeUndefined();
    });

    await user.mutation(api.jobDiscovery.updateJobTracking, {
      jobId,
      status: "applied",
    });
    const firstAppliedAt = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", jobId),
        )
        .take(10);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "applied" });
      return rows[0].appliedAt;
    });

    await user.mutation(api.jobDiscovery.updateJobTracking, {
      jobId,
      status: "interview",
      note: "Technical interview scheduled.",
    });
    await user.mutation(api.jobDiscovery.addJobTrackingNote, {
      jobId,
      note: "Bring the architecture case study.",
    });
    const timeline = await user.query(
      api.jobDiscovery.listJobTrackingTimeline,
      { jobId },
    );
    expect(
      timeline.map(({ id: _id, createdAt: _createdAt, ...event }) => event),
    ).toEqual([
      {
        kind: "note",
        note: "Bring the architecture case study.",
      },
      {
        kind: "status_change",
        status: "interview",
        note: "Technical interview scheduled.",
      },
      { kind: "status_change", status: "applied" },
      {
        kind: "status_change",
        status: "saved",
        note: "Follow up with Dana on Thursday.",
      },
    ]);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", jobId),
        )
        .unique();
      expect(row).toMatchObject({
        status: "interview",
        appliedAt: firstAppliedAt,
      });
    });
    await expect(
      user.mutation(api.jobDiscovery.updateJobTracking, {
        jobId,
        status: "interview",
        note: "x".repeat(3_001),
      }),
    ).rejects.toThrow();
  });

  it("saves an untracked suggestion when its first standalone note is added", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("jobs").first())?._id,
    );
    if (!jobId) throw new Error("Expected stored job");
    const user = asUser(t, userId);

    await user.mutation(api.jobDiscovery.addJobTrackingNote, {
      jobId,
      note: "  Ask about the reporting line.  ",
    });

    const feed = await user.query(api.jobDiscovery.listCurrentUserJobs, {
      view: "inProgress",
    });
    expect(feed.jobs[0]).toMatchObject({
      id: jobId,
      trackingStatus: "saved",
    });
    expect(
      feed.jobs[0].trackingTimeline?.map(
        ({ id: _id, createdAt: _createdAt, ...event }) => event,
      ),
    ).toEqual([
      {
        kind: "note",
        note: "Ask about the reporting line.",
      },
      { kind: "status_change", status: "saved" },
    ]);
  });

  it("keeps tracking records isolated between authenticated users", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await createUser(t);
    const otherId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "other@example.com",
        name: "Other candidate",
      }),
    );
    await addCompletedProfile(t, ownerId);
    await addCompletedProfile(t, otherId);
    await ingestCandidates(t, ownerId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("jobs").first())?._id,
    );
    if (!jobId) throw new Error("Expected stored job");

    await asUser(t, ownerId).mutation(api.jobDiscovery.updateJobTracking, {
      jobId,
      status: "applied",
      note: "Owner note",
    });
    await asUser(t, otherId).mutation(api.jobDiscovery.updateJobTracking, {
      jobId,
      status: "saved",
      note: "Other note",
    });

    await t.run(async (ctx) => {
      const owner = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", ownerId).eq("jobId", jobId),
        )
        .unique();
      const other = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", otherId).eq("jobId", jobId),
        )
        .unique();
      expect(owner).toMatchObject({ status: "applied" });
      expect(other).toMatchObject({ status: "saved" });
    });
  });

  it("distinguishes discovery that has not run from a completed empty search", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await addCompletedProfile(t, userId);

    const pendingFeed = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    expect(pendingFeed.jobs).toHaveLength(0);
    expect(pendingFeed.discoveryState).toBe("pending");

    await t.run((ctx) =>
      ctx.db.insert("dailyDiscoveryAttempts", {
        userId,
        dayKey: globalDayKey(Date.now()),
        lastAttemptAt: Date.now(),
        lastOutcome: "completed",
      }),
    );
    const completedFeed = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    expect(completedFeed.jobs).toHaveLength(0);
    expect(completedFeed.discoveryState).toBe("complete");
    expect(completedFeed.emptyState?.reason).toBe("no_active_jobs");
  });

  it("exposes authenticated development diagnostics", async () => {
    vi.stubEnv("DEV_TOOLS_ENABLED", "true");
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await ingestCandidates(t, userId, [
      { job: normalizedJob(), verification: verification() },
    ]);
    const jobId = await t.run(
      async (ctx) => (await ctx.db.query("jobs").first())?._id,
    );
    if (!jobId) throw new Error("Expected job");
    const diagnostics = await asUser(t, userId).query(
      api.jobActivity.getDiagnostics,
      { jobId, now: Date.now() },
    );
    expect(diagnostics).toMatchObject({
      canonicalJobId: jobId,
      sourceCount: 1,
      lifecycleStatus: "verified_active",
      activityStatus: "active",
    });
    expect(diagnostics.sources[0]).toMatchObject({
      activityStatus: "verified_active",
    });
  });
});

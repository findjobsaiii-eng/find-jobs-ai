/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { evaluateJobQuality } from "./jobQuality";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
}

async function createUser(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "candidate@example.com",
      name: "Candidate",
    }),
  );
}

const searchProfile = {
  targetJobTitles: ["Frontend Engineer"],
  skills: ["React", "TypeScript", "Accessibility"],
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
  languages: [
    { languageCode: "en", proficiency: "fluent" },
    { languageCode: "he", proficiency: "native" },
  ],
  minimumMonthlySalaryIls: 20_000,
};

const runtime = {
  enabled: true,
  globalDailyRunLimit: 20,
  globalDailyQueryLimit: 30,
  maxConcurrentRuns: 3,
  outputTokenLimit: 2_000,
};

const normalizedJob = {
  normalizedSourceUrl: "https://careers.example.com/jobs/role-1",
  jobFingerprint: "company-title-location",
  contentHash: "content-one",
  title: "Frontend Engineer",
  companyName: "Example Company",
  sourceUrl: "https://careers.example.com/jobs/role-1",
  sourceName: "Example Careers",
  sourceType: "employer" as const,
  descriptionText:
    "Build accessible React and TypeScript product interfaces in Tel Aviv.",
  requirementsText: "Seven years of frontend engineering experience.",
  responsibilities: ["Build interfaces"],
  requiredSkills: ["React", "TypeScript"],
  preferredSkills: ["Accessibility"],
  requiredExperienceYearsMin: 5,
  requiredExperienceYearsMax: 10,
  educationRequirements: [],
  languages: ["English"],
  country: "Israel",
  city: "Tel Aviv-Yafo",
  locationText: "Tel Aviv-Yafo, Israel",
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
      title: null,
      excerpt: null,
    },
  ],
};

function verification(
  finalUrl = normalizedJob.sourceUrl,
  sourceTier: "employer" | "ats" | "job_board" | "aggregator" = "employer",
) {
  return {
    activityStatus: "verified_active" as const,
    finalUrl,
    domain: new URL(finalUrl).hostname,
    sourceTier,
    externalJobId: null,
    verifiedAt: Date.now(),
    verificationMethod: "http_content_v1" as const,
    verificationEvidence: "HTTP 200 and expected role/company confirmed",
  };
}

async function createReservation(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  fingerprint: string,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const queryId = await ctx.db.insert("jobSearchQueries", {
      fingerprint,
      normalizedCriteria: "{}",
      generatedQueries: ["frontend engineer Tel Aviv jobs"],
      createdAt: now,
    });
    const reservationId = `reservation-${fingerprint}`;
    const runId = await ctx.db.insert("jobSearchRuns", {
      userId,
      queryId,
      fingerprint,
      status: "running",
      provider: "openai",
      model: "test-model",
      plan: "free",
      resultSource: "fresh",
      reservationId,
      queryCount: 1,
      webSearchToolCallCount: 0,
      startedAt: now,
      returnedCandidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      insertedCount: 0,
      deduplicatedCount: 0,
    });
    await ctx.db.insert("jobSearchUsage", {
      userId,
      operationType: "job_discovery",
      plan: "free",
      searchRunId: runId,
      reservationId,
      status: "reserved",
      freshProviderCall: true,
      providerRequestStarted: true,
      resultSource: "fresh",
      queryCount: 1,
      webSearchToolCallCount: 0,
      acceptedJobs: 0,
      createdAt: now,
      quotaWindowIdentifier: `free:${now}`,
      globalDayKey: new Date(now).toISOString().slice(0, 10),
    });
    return { runId, reservationId, queryId };
  });
}

const beginArgs = (fingerprint: string, enabled = true) => ({
  fingerprint,
  normalizedCriteria: "{}",
  generatedQueries: ["frontend engineer Tel Aviv jobs"],
  model: "test-model",
  profile: searchProfile,
  runtime: { ...runtime, enabled },
});

describe("job discovery quality and usage controls", () => {
  it("rejects unauthenticated searches and incomplete authenticated profiles", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.jobDiscoveryActions.discoverJobsForCurrentUser, {}),
    ).rejects.toThrow();
    const userId = await createUser(t);
    await expect(
      asUser(t, userId).action(
        api.jobDiscoveryActions.discoverJobsForCurrentUser,
        {},
      ),
    ).rejects.toThrow();
  });

  it("atomically creates one reservation for concurrent requests", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const user = asUser(t, userId);
    const attempts = await Promise.allSettled([
      user.mutation(internal.jobDiscovery.beginSearch, beginArgs("concurrent")),
      user.mutation(internal.jobDiscovery.beginSearch, beginArgs("concurrent")),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobSearchUsage").collect()).toHaveLength(1);
      expect(await ctx.db.query("jobSearchRuns").collect()).toHaveLength(1);
    });
  });

  it("prevents a free user from reserving a second fresh search in seven days", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const user = asUser(t, userId);
    const first = await user.mutation(
      internal.jobDiscovery.beginSearch,
      beginArgs("first"),
    );
    if (first.kind !== "started")
      throw new Error("Expected a fresh reservation");
    await user.mutation(internal.jobDiscovery.markProviderStarted, {
      runId: first.runId,
      reservationId: first.reservationId,
    });
    await user.mutation(internal.jobDiscovery.failSearch, {
      runId: first.runId,
      reservationId: first.reservationId,
      errorCategory: "provider_connection",
    });
    await expect(
      user.mutation(internal.jobDiscovery.beginSearch, beginArgs("second")),
    ).rejects.toThrow(/SEARCH_QUOTA_EXCEEDED/u);
  });

  it("reuses eligible cached jobs without consuming fresh quota", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const queryId = await ctx.db.insert("jobSearchQueries", {
        fingerprint: "cached",
        normalizedCriteria: "{}",
        generatedQueries: ["frontend engineer Tel Aviv jobs"],
        createdAt: now,
        lastSuccessfulRunAt: now,
      });
      const runId = await ctx.db.insert("jobSearchRuns", {
        userId,
        queryId,
        fingerprint: "cached",
        status: "completed",
        provider: "openai",
        model: "test-model",
        resultSource: "fresh",
        startedAt: now,
        completedAt: now,
        returnedCandidateCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        insertedCount: 1,
        deduplicatedCount: 0,
      });
      const jobId = await ctx.db.insert("jobs", {
        ...normalizedJob,
        firstDiscoveredAt: now,
        lastDiscoveredAt: now,
        lastVerifiedAt: now,
        activityStatus: "active",
        lifecycleStatus: "verified_active",
      });
      const sourceId = await ctx.db.insert("jobSources", {
        jobId,
        sourceUrl: normalizedJob.sourceUrl,
        normalizedUrl: normalizedJob.normalizedSourceUrl,
        finalUrl: normalizedJob.sourceUrl,
        domain: "careers.example.com",
        sourceTier: "employer",
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: now,
        activityStatus: "verified_active",
        verificationMethod: "http_content_v1",
        verificationEvidence: "verified",
      });
      await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
      await ctx.db.insert("jobDiscoveries", {
        jobId,
        searchRunId: runId,
        userId,
        queryId,
        discoveredAt: now,
        reused: false,
      });
    });
    const result = await asUser(t, userId).mutation(
      internal.jobDiscovery.beginSearch,
      beginArgs("cached"),
    );
    expect(result).toMatchObject({
      kind: "reused",
      resultSource: "cache",
      acceptedCount: 1,
    });
    const user = asUser(t, userId);
    const before = await user.query(api.jobDiscovery.listCurrentUserJobs, {});
    const jobId = before.jobs[0].id;
    const other = asUser(t, await createUser(t));
    await expect(
      other.mutation(api.jobDiscovery.setApplicationStatus, {
        jobId,
        applied: true,
      }),
    ).rejects.toThrow(/JOB_NOT_AVAILABLE/u);
    await user.mutation(api.jobDiscovery.setApplicationStatus, {
      jobId,
      applied: true,
    });
    await user.mutation(api.jobDiscovery.setApplicationStatus, {
      jobId,
      applied: true,
    });
    expect(
      (await user.query(api.jobDiscovery.listCurrentUserJobs, {})).jobs,
    ).toHaveLength(0);
    expect(
      (
        await other.query(api.jobDiscovery.listCurrentUserJobs, {
          view: "inProgress",
        })
      ).jobs,
    ).toHaveLength(0);
    await t.run(async (ctx) => {
      await ctx.db.patch("jobs", jobId, { lifecycleStatus: "inactive" });
    });
    const tracked = await user.query(api.jobDiscovery.listCurrentUserJobs, {
      view: "inProgress",
    });
    expect(tracked.jobs).toHaveLength(1);
    expect(tracked.jobs[0].title).toBe(before.jobs[0].title);
    await other.mutation(api.jobDiscovery.setApplicationStatus, {
      jobId,
      applied: false,
    });
    expect(
      (
        await user.query(api.jobDiscovery.listCurrentUserJobs, {
          view: "inProgress",
        })
      ).jobs,
    ).toHaveLength(1);
    await user.mutation(api.jobDiscovery.setApplicationStatus, {
      jobId,
      applied: false,
    });
    expect(
      (
        await user.query(api.jobDiscovery.listCurrentUserJobs, {
          view: "inProgress",
        })
      ).jobs,
    ).toHaveLength(0);
    await t.run(async (ctx) => {
      const usage = await ctx.db.query("jobSearchUsage").collect();
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({
        freshProviderCall: false,
        status: "completed",
      });
    });
  });

  it("fails closed at the kill switch before creating a provider reservation", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await expect(
      asUser(t, userId).mutation(
        internal.jobDiscovery.beginSearch,
        beginArgs("disabled", false),
      ),
    ).rejects.toThrow(/JOB_SEARCH_DISABLED/u);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobSearchUsage").collect()).toHaveLength(0);
    });
  });

  it("hides unknown and inactive jobs even when a match record exists", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const queryId = await ctx.db.insert("jobSearchQueries", {
        fingerprint: "visibility",
        normalizedCriteria: "{}",
        generatedQueries: ["query"],
        createdAt: now,
      });
      const runId = await ctx.db.insert("jobSearchRuns", {
        userId,
        queryId,
        fingerprint: "visibility",
        status: "completed",
        provider: "openai",
        model: "test",
        startedAt: now,
        completedAt: now,
        returnedCandidateCount: 3,
        acceptedCount: 1,
        rejectedCount: 2,
        insertedCount: 3,
        deduplicatedCount: 0,
      });
      for (const [index, lifecycle] of [
        "verified_active",
        "inactive",
        "discovered",
      ].entries()) {
        const url = `https://careers.example.com/jobs/${index}`;
        const jobId = await ctx.db.insert("jobs", {
          ...normalizedJob,
          normalizedSourceUrl: url,
          sourceUrl: url,
          jobFingerprint: `job-${index}`,
          contentHash: `content-${index}`,
          firstDiscoveredAt: now,
          lastDiscoveredAt: now,
          lastVerifiedAt: now,
          activityStatus:
            lifecycle === "verified_active" ? "active" : "inactive",
          lifecycleStatus: lifecycle as
            "verified_active" | "inactive" | "discovered",
        });
        const sourceId = await ctx.db.insert("jobSources", {
          jobId,
          sourceUrl: url,
          normalizedUrl: url,
          finalUrl: url,
          domain: "careers.example.com",
          sourceTier: "employer",
          firstSeenAt: now,
          lastSeenAt: now,
          lastVerifiedAt: now,
          activityStatus:
            lifecycle === "verified_active" ? "verified_active" : "inactive",
          verificationMethod: "http_content_v1",
          verificationEvidence: "test",
        });
        await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
        const quality = evaluateJobQuality(normalizedJob, searchProfile);
        await ctx.db.insert("jobMatches", {
          userId,
          jobId,
          searchRunId: runId,
          outcome: "eligible",
          exclusionReasons: [],
          relevanceScore: quality.relevanceScore,
          scoreComponents: quality.scoreComponents,
          matchReasons: quality.matchReasons,
          resultSource: "fresh",
          evaluatedAt: now,
        });
      }
    });
    const visible = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      {},
    );
    expect(visible.jobs).toHaveLength(1);
  });

  it("consolidates two verified sources into one visible vacancy", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const reservation = await createReservation(t, userId, "dedupe");
    const secondUrl = "https://board.example.net/postings/frontend-123";
    const result = await asUser(t, userId).mutation(
      internal.jobDiscovery.completeSearch,
      {
        runId: reservation.runId,
        reservationId: reservation.reservationId,
        returnedCandidateCount: 2,
        rejectedCount: 0,
        webSearchToolCallCount: 1,
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        profile: searchProfile,
        jobs: [
          { job: normalizedJob, verification: verification() },
          {
            job: {
              ...normalizedJob,
              normalizedSourceUrl: secondUrl,
              sourceUrl: secondUrl,
              sourceName: "Example Board",
              sourceType: "job_board",
              contentHash: "content-two",
              sourceEvidence: [{ url: secondUrl, title: null, excerpt: null }],
            },
            verification: verification(secondUrl, "job_board"),
          },
        ],
      },
    );
    expect(result).toMatchObject({
      acceptedCount: 1,
      insertedCount: 1,
      deduplicatedCount: 1,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(1);
      expect(await ctx.db.query("jobSources").collect()).toHaveLength(2);
    });
    const visible = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      {},
    );
    expect(visible.jobs).toHaveLength(1);
    expect(visible.jobs[0]?.sourceTier).toBe("employer");
  });

  it("excludes a job with a hard work-arrangement contradiction", () => {
    const evaluation = evaluateJobQuality(
      { ...normalizedJob, workArrangement: "onsite" },
      { ...searchProfile, workArrangements: ["remote"] },
    );
    expect(evaluation).toMatchObject({ outcome: "excluded" });
    expect(evaluation.exclusionReasons).toContain("work_arrangement_conflict");
  });
});

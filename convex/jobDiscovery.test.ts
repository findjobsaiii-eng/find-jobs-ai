/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

const normalizedJob = {
  normalizedSourceUrl: "https://jobs.example.com/role-1",
  jobFingerprint: "company-title-location",
  contentHash: "content-one",
  title: "Frontend Engineer",
  companyName: "Example Company",
  sourceUrl: "https://jobs.example.com/role-1",
  sourceName: "Example Careers",
  sourceType: "employer" as const,
  descriptionText: "Build accessible product interfaces.",
  requirementsText: null,
  responsibilities: ["Build interfaces"],
  requiredSkills: ["React"],
  preferredSkills: [],
  requiredExperienceYearsMin: 2,
  requiredExperienceYearsMax: null,
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
  sourceEvidence: [
    { url: "https://jobs.example.com/role-1", title: null, excerpt: null },
  ],
};

describe("job discovery persistence and access", () => {
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

  it("reuses an identical successful run from the last 24 hours", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const queryId = await ctx.db.insert("jobSearchQueries", {
        fingerprint: "same-fingerprint",
        normalizedCriteria: "{}",
        generatedQueries: ["frontend engineer Israel jobs"],
        createdAt: now,
        lastSuccessfulRunAt: now,
      });
      const runId = await ctx.db.insert("jobSearchRuns", {
        userId,
        queryId,
        fingerprint: "same-fingerprint",
        status: "completed",
        provider: "openai",
        model: "test-model",
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
        activityStatus: "unknown",
      });
      await ctx.db.insert("jobDiscoveries", {
        jobId,
        searchRunId: runId,
        userId,
        queryId,
        discoveredAt: now,
        reused: false,
      });
      return { jobId };
    });
    const result = await asUser(t, userId).mutation(
      internal.jobDiscovery.beginSearch,
      {
        fingerprint: "same-fingerprint",
        normalizedCriteria: "{}",
        generatedQueries: ["frontend engineer Israel jobs"],
        model: "test-model",
      },
    );
    expect(result).toMatchObject({ kind: "reused", acceptedCount: 1 });
    const jobs = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      {},
    );
    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0]?.id).toBe(seeded.jobId);
  });

  it("updates a duplicate URL instead of creating a second central job", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t);
    const runId = await t.run(async (ctx) => {
      const now = Date.now();
      const queryId = await ctx.db.insert("jobSearchQueries", {
        fingerprint: "new-fingerprint",
        normalizedCriteria: "{}",
        generatedQueries: ["frontend engineer Israel jobs"],
        createdAt: now,
      });
      await ctx.db.insert("jobs", {
        ...normalizedJob,
        firstDiscoveredAt: now - 10_000,
        lastDiscoveredAt: now - 10_000,
        activityStatus: "unknown",
      });
      return await ctx.db.insert("jobSearchRuns", {
        userId,
        queryId,
        fingerprint: "new-fingerprint",
        status: "running",
        provider: "openai",
        model: "test-model",
        startedAt: now,
        returnedCandidateCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        insertedCount: 0,
        deduplicatedCount: 0,
      });
    });
    const result = await asUser(t, userId).mutation(
      internal.jobDiscovery.completeSearch,
      {
        runId,
        returnedCandidateCount: 1,
        rejectedCount: 0,
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        jobs: [{ ...normalizedJob, contentHash: "newer-content" }],
      },
    );
    expect(result).toEqual({
      acceptedCount: 1,
      insertedCount: 0,
      deduplicatedCount: 1,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toHaveLength(1);
    });
  });
});

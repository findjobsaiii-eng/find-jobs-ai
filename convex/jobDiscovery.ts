import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const COOLDOWN_MS = 60 * 60 * 1_000;
const ACTIVE_RUN_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_JOBS_PER_RUN = 10;

const usageValidator = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
});
const evidenceValidator = v.object({
  url: v.string(),
  title: v.union(v.string(), v.null()),
  excerpt: v.union(v.string(), v.null()),
});
const jobInputValidator = v.object({
  normalizedSourceUrl: v.string(),
  jobFingerprint: v.string(),
  contentHash: v.string(),
  title: v.string(),
  companyName: v.string(),
  sourceUrl: v.string(),
  sourceName: v.union(v.string(), v.null()),
  sourceType: v.union(
    v.literal("employer"),
    v.literal("ats"),
    v.literal("job_board"),
    v.literal("other"),
  ),
  descriptionText: v.union(v.string(), v.null()),
  requirementsText: v.union(v.string(), v.null()),
  responsibilities: v.array(v.string()),
  requiredSkills: v.array(v.string()),
  preferredSkills: v.array(v.string()),
  requiredExperienceYearsMin: v.union(v.number(), v.null()),
  requiredExperienceYearsMax: v.union(v.number(), v.null()),
  educationRequirements: v.array(v.string()),
  languages: v.array(v.string()),
  country: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
  locationText: v.union(v.string(), v.null()),
  workArrangement: v.union(
    v.literal("onsite"),
    v.literal("hybrid"),
    v.literal("remote"),
    v.literal("unknown"),
  ),
  employmentType: v.union(
    v.literal("full-time"),
    v.literal("part-time"),
    v.literal("contract"),
    v.literal("temporary"),
    v.literal("internship"),
    v.literal("unknown"),
  ),
  salaryMin: v.union(v.number(), v.null()),
  salaryMax: v.union(v.number(), v.null()),
  salaryCurrency: v.union(v.string(), v.null()),
  salaryPeriod: v.union(
    v.literal("hour"),
    v.literal("day"),
    v.literal("month"),
    v.literal("year"),
    v.null(),
  ),
  postedAt: v.union(v.string(), v.null()),
  applicationDeadline: v.union(v.string(), v.null()),
  sourceEvidence: v.array(evidenceValidator),
});

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return userId;
}

async function getProfile(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("candidateProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

function profileIncomplete(): never {
  throw new ConvexError({ code: "INCOMPLETE_SEARCH_PROFILE" });
}

export const getCurrentSearchProfile = internalQuery({
  args: {},
  returns: v.object({
    targetJobTitles: v.array(v.string()),
    skills: v.array(v.string()),
    yearsOfExperience: v.number(),
    preferredPlaceId: v.string(),
    locationRadiusKm: v.number(),
    workArrangements: v.array(v.string()),
    employmentTypes: v.array(v.string()),
    languages: v.array(
      v.object({ languageCode: v.string(), proficiency: v.string() }),
    ),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (
      !profile?.onboardingCompleted ||
      !profile.targetJobTitleIds?.length ||
      profile.yearsOfExperience === undefined ||
      !profile.skillIds?.length ||
      !profile.preferredPlaceIds?.[0] ||
      profile.locationRadiusKm === undefined ||
      !profile.workArrangements?.length ||
      !profile.employmentTypes?.length ||
      !profile.languages?.length
    ) {
      profileIncomplete();
    }
    const [titles, skills] = await Promise.all([
      Promise.all(
        profile.targetJobTitleIds.map((id) => ctx.db.get("catalogItems", id)),
      ),
      Promise.all(profile.skillIds.map((id) => ctx.db.get("catalogItems", id))),
    ]);
    const label = (item: Doc<"catalogItems"> | null) =>
      item?.active &&
      (item.visibility === "public" || item.ownerUserId === userId)
        ? (item.labelEn ?? item.labelHe ?? null)
        : null;
    const targetJobTitles = titles
      .map(label)
      .filter((value): value is string => Boolean(value));
    const selectedSkills = skills
      .map(label)
      .filter((value): value is string => Boolean(value));
    if (!targetJobTitles.length || !selectedSkills.length) profileIncomplete();
    return {
      targetJobTitles,
      skills: selectedSkills,
      yearsOfExperience: profile.yearsOfExperience,
      preferredPlaceId: profile.preferredPlaceIds[0],
      locationRadiusKm: profile.locationRadiusKm,
      workArrangements: profile.workArrangements,
      employmentTypes: profile.employmentTypes,
      languages: profile.languages,
    };
  },
});

const beginResultValidator = v.union(
  v.object({ kind: v.literal("started"), runId: v.id("jobSearchRuns") }),
  v.object({
    kind: v.literal("reused"),
    runId: v.id("jobSearchRuns"),
    acceptedCount: v.number(),
  }),
);

export const beginSearch = internalMutation({
  args: {
    fingerprint: v.string(),
    normalizedCriteria: v.string(),
    generatedQueries: v.array(v.string()),
    model: v.string(),
  },
  returns: beginResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const active = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "running"),
      )
      .first();
    const now = Date.now();
    if (active && active.startedAt >= now - ACTIVE_RUN_TIMEOUT_MS) {
      throw new ConvexError({ code: "SEARCH_ALREADY_RUNNING" });
    }
    if (active) {
      await ctx.db.patch("jobSearchRuns", active._id, {
        status: "failed",
        completedAt: now,
        errorCategory: "run_timeout",
      });
    }
    let queryRecord = await ctx.db
      .query("jobSearchQueries")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .unique();
    if (!queryRecord) {
      const queryId = await ctx.db.insert("jobSearchQueries", {
        fingerprint: args.fingerprint,
        normalizedCriteria: args.normalizedCriteria,
        generatedQueries: args.generatedQueries,
        createdAt: now,
      });
      queryRecord = await ctx.db.get("jobSearchQueries", queryId);
    }
    if (!queryRecord) throw new Error("Search query creation failed");

    const cachedRun = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_fingerprint_and_status_and_completedAt", (q) =>
        q
          .eq("fingerprint", args.fingerprint)
          .eq("status", "completed")
          .gte("completedAt", now - CACHE_TTL_MS),
      )
      .order("desc")
      .first();
    if (cachedRun) {
      const cachedDiscoveries = await ctx.db
        .query("jobDiscoveries")
        .withIndex("by_searchRunId", (q) => q.eq("searchRunId", cachedRun._id))
        .take(MAX_JOBS_PER_RUN);
      const runId = await ctx.db.insert("jobSearchRuns", {
        userId,
        queryId: queryRecord._id,
        fingerprint: args.fingerprint,
        status: "reused",
        provider: "openai",
        model: args.model,
        startedAt: now,
        completedAt: now,
        returnedCandidateCount: 0,
        acceptedCount: cachedDiscoveries.length,
        rejectedCount: 0,
        insertedCount: 0,
        deduplicatedCount: cachedDiscoveries.length,
      });
      for (const discovery of cachedDiscoveries) {
        await ctx.db.insert("jobDiscoveries", {
          jobId: discovery.jobId,
          searchRunId: runId,
          userId,
          queryId: queryRecord._id,
          discoveredAt: now,
          reused: true,
        });
      }
      return {
        kind: "reused" as const,
        runId,
        acceptedCount: cachedDiscoveries.length,
      };
    }

    const recentRun = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_startedAt", (q) =>
        q.eq("userId", userId).gte("startedAt", now - COOLDOWN_MS),
      )
      .order("desc")
      .first();
    if (recentRun) {
      throw new ConvexError({
        code: "SEARCH_COOLDOWN",
        retryAfterMs: Math.max(1, recentRun.startedAt + COOLDOWN_MS - now),
      });
    }
    const runId = await ctx.db.insert("jobSearchRuns", {
      userId,
      queryId: queryRecord._id,
      fingerprint: args.fingerprint,
      status: "running",
      provider: "openai",
      model: args.model,
      startedAt: now,
      returnedCandidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      insertedCount: 0,
      deduplicatedCount: 0,
    });
    return { kind: "started" as const, runId };
  },
});

export const completeSearch = internalMutation({
  args: {
    runId: v.id("jobSearchRuns"),
    returnedCandidateCount: v.number(),
    rejectedCount: v.number(),
    usage: usageValidator,
    jobs: v.array(jobInputValidator),
  },
  returns: v.object({
    acceptedCount: v.number(),
    insertedCount: v.number(),
    deduplicatedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    if (!run || run.userId !== userId || run.status !== "running") {
      throw new ConvexError({ code: "INVALID_SEARCH_RUN" });
    }
    const now = Date.now();
    let insertedCount = 0;
    let deduplicatedCount = 0;
    const seenJobs = new Set<Id<"jobs">>();
    for (const job of args.jobs.slice(0, MAX_JOBS_PER_RUN)) {
      let existing = await ctx.db
        .query("jobs")
        .withIndex("by_normalizedSourceUrl", (q) =>
          q.eq("normalizedSourceUrl", job.normalizedSourceUrl),
        )
        .unique();
      existing ??= await ctx.db
        .query("jobs")
        .withIndex("by_jobFingerprint", (q) =>
          q.eq("jobFingerprint", job.jobFingerprint),
        )
        .first();
      let jobId: Id<"jobs">;
      if (existing) {
        jobId = existing._id;
        deduplicatedCount += 1;
        await ctx.db.patch("jobs", jobId, {
          ...job,
          firstDiscoveredAt: existing.firstDiscoveredAt,
          lastDiscoveredAt: now,
          activityStatus: existing.activityStatus,
        });
      } else {
        jobId = await ctx.db.insert("jobs", {
          ...job,
          firstDiscoveredAt: now,
          lastDiscoveredAt: now,
          activityStatus: "unknown",
        });
        insertedCount += 1;
      }
      if (seenJobs.has(jobId)) continue;
      seenJobs.add(jobId);
      await ctx.db.insert("jobDiscoveries", {
        jobId,
        searchRunId: run._id,
        userId,
        queryId: run.queryId,
        discoveredAt: now,
        reused: false,
      });
    }
    await ctx.db.patch("jobSearchRuns", run._id, {
      status: "completed",
      completedAt: now,
      usage: args.usage,
      returnedCandidateCount: args.returnedCandidateCount,
      acceptedCount: seenJobs.size,
      rejectedCount: args.rejectedCount,
      insertedCount,
      deduplicatedCount,
    });
    await ctx.db.patch("jobSearchQueries", run.queryId, {
      lastSuccessfulRunAt: now,
    });
    return { acceptedCount: seenJobs.size, insertedCount, deduplicatedCount };
  },
});

export const failSearch = internalMutation({
  args: { runId: v.id("jobSearchRuns"), errorCategory: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    if (run?.userId === userId && run.status === "running") {
      await ctx.db.patch("jobSearchRuns", run._id, {
        status: "failed",
        completedAt: Date.now(),
        errorCategory: args.errorCategory.slice(0, 80),
      });
    }
    return null;
  },
});

export const listCurrentUserJobs = query({
  args: {},
  returns: v.object({
    jobs: v.array(
      v.object({
        id: v.id("jobs"),
        title: v.string(),
        companyName: v.string(),
        sourceUrl: v.string(),
        sourceName: v.union(v.string(), v.null()),
        locationText: v.union(v.string(), v.null()),
        workArrangement: v.string(),
        salaryMin: v.union(v.number(), v.null()),
        salaryMax: v.union(v.number(), v.null()),
        salaryCurrency: v.union(v.string(), v.null()),
        salaryPeriod: v.union(v.string(), v.null()),
        discoveredAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const discoveries = await ctx.db
      .query("jobDiscoveries")
      .withIndex("by_userId_and_discoveredAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    const seen = new Set<Id<"jobs">>();
    const jobs = [];
    for (const discovery of discoveries) {
      if (seen.has(discovery.jobId)) continue;
      const job = await ctx.db.get("jobs", discovery.jobId);
      if (!job) continue;
      seen.add(job._id);
      jobs.push({
        id: job._id,
        title: job.title,
        companyName: job.companyName,
        sourceUrl: job.sourceUrl,
        sourceName: job.sourceName,
        locationText: job.locationText,
        workArrangement: job.workArrangement,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        discoveredAt: discovery.discoveredAt,
      });
      if (jobs.length === 25) break;
    }
    return { jobs };
  },
});

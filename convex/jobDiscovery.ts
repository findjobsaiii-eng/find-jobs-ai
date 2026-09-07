import { jobFeedItem } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  env,
  mutation,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { evaluateJobQuality, isDisplayEligibleJob } from "./jobQuality";
import type { SearchProfile } from "./jobDiscoveryModel";
import { buildSearchPlan, hashText, normalizedKey } from "./jobDiscoveryModel";
import {
  CENTRAL_REUSE_MINIMUM_JOBS,
  globalDayKey,
  JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS,
  JOB_SEARCH_CACHE_TTL_MS,
  JOB_SEARCH_PLAN_POLICIES,
  JOB_SOURCE_VERIFICATION_TTL_MS,
  quotaWindowIdentifier,
  type JobSearchPlan,
} from "./jobSearchPolicy";
import { parseJobSearchRuntimeConfig } from "./jobSearchRuntimeConfig";

const planValidator = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("admin"),
);
const resultSourceValidator = v.union(
  v.literal("fresh"),
  v.literal("cache"),
  v.literal("central"),
);
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
const locationValidator = v.object({
  placeId: v.string(),
  formattedAddress: v.string(),
  city: v.optional(v.string()),
  administrativeArea: v.optional(v.string()),
  country: v.string(),
  countryCode: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusKm: v.number(),
});
const searchProfileValidator = v.object({
  targetJobTitles: v.array(v.string()),
  skills: v.array(v.string()),
  yearsOfExperience: v.number(),
  location: locationValidator,
  workArrangements: v.array(v.string()),
  employmentTypes: v.array(v.string()),
  languages: v.array(
    v.object({ languageCode: v.string(), proficiency: v.string() }),
  ),
  minimumMonthlySalaryIls: v.number(),
});
const sourceVerificationValidator = v.object({
  activityStatus: v.union(
    v.literal("verified_active"),
    v.literal("inactive"),
    v.literal("verification_failed"),
  ),
  finalUrl: v.union(v.string(), v.null()),
  domain: v.string(),
  sourceTier: v.union(
    v.literal("employer"),
    v.literal("ats"),
    v.literal("job_board"),
    v.literal("aggregator"),
  ),
  externalJobId: v.union(v.string(), v.null()),
  verifiedAt: v.number(),
  verificationMethod: v.literal("http_content_v1"),
  verificationEvidence: v.string(),
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
  workAuthorizationRequirements: v.union(v.string(), v.null()),
  sourceEvidence: v.array(evidenceValidator),
});
const verifiedJobInputValidator = v.object({
  job: jobInputValidator,
  verification: sourceVerificationValidator,
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

async function currentPlan(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<JobSearchPlan> {
  const entitlements = await ctx.db
    .query("userEntitlements")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(10);
  return (
    entitlements.find(
      (item) =>
        item.active && (item.expiresAt === undefined || item.expiresAt > now),
    )?.plan ?? "free"
  );
}

async function loadSearchProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<SearchProfile> {
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
    !profile.languages?.length ||
    profile.minimumMonthlySalaryIls === undefined
  ) {
    profileIncomplete();
  }
  if (
    !profile.primaryLocation ||
    profile.primaryLocation.placeId !== profile.preferredPlaceIds[0] ||
    profile.primaryLocation.radiusKm !== profile.locationRadiusKm
  ) {
    throw new ConvexError({ code: "LOCATION_RECONFIRM_REQUIRED" });
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
    location: profile.primaryLocation,
    workArrangements: profile.workArrangements,
    employmentTypes: profile.employmentTypes,
    languages: profile.languages,
    minimumMonthlySalaryIls: profile.minimumMonthlySalaryIls,
  };
}

export const getCurrentSearchProfile = internalQuery({
  args: { userId: v.optional(v.id("users")) },
  returns: searchProfileValidator,
  handler: async (ctx, args): Promise<SearchProfile> => {
    const userId = args.userId ?? (await requireUserId(ctx));
    return await loadSearchProfile(ctx, userId);
  },
});

async function eligibleCandidate(
  ctx: QueryCtx | MutationCtx,
  job: Doc<"jobs">,
  profile: SearchProfile,
  now: number,
) {
  if (
    !isDisplayEligibleJob(job) ||
    !job.lastVerifiedAt ||
    job.lastVerifiedAt < now - JOB_SOURCE_VERIFICATION_TTL_MS
  ) {
    return null;
  }
  const source = job.bestSourceId
    ? await ctx.db.get("jobSources", job.bestSourceId)
    : null;
  if (
    !source ||
    source.activityStatus !== "verified_active" ||
    !source.finalUrl ||
    !source.lastVerifiedAt ||
    source.lastVerifiedAt < now - JOB_SOURCE_VERIFICATION_TTL_MS
  ) {
    return null;
  }
  const quality = evaluateJobQuality(job, profile);
  return quality.outcome === "eligible" ? { job, quality } : null;
}

async function upsertMatch(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    jobId: Id<"jobs">;
    runId: Id<"jobSearchRuns">;
    quality: ReturnType<typeof evaluateJobQuality>;
    resultSource: "fresh" | "cache" | "central";
    now: number;
  },
) {
  const existing = await ctx.db
    .query("jobMatches")
    .withIndex("by_userId_and_jobId", (q) =>
      q.eq("userId", args.userId).eq("jobId", args.jobId),
    )
    .first();
  const value = {
    searchRunId: args.runId,
    outcome: args.quality.outcome,
    exclusionReasons: args.quality.exclusionReasons,
    relevanceScore: args.quality.relevanceScore,
    scoreComponents: args.quality.scoreComponents,
    matchReasons: args.quality.matchReasons,
    resultSource: args.resultSource,
    evaluatedAt: args.now,
  } as const;
  if (existing) await ctx.db.patch("jobMatches", existing._id, value);
  else {
    await ctx.db.insert("jobMatches", {
      userId: args.userId,
      jobId: args.jobId,
      ...value,
    });
  }
}

async function reusableCandidates(
  ctx: QueryCtx | MutationCtx,
  args: {
    fingerprint: string;
    profile: SearchProfile;
    maxAcceptedJobs: number;
    now: number;
  },
) {
  const cachedRun = await ctx.db
    .query("jobSearchRuns")
    .withIndex("by_fingerprint_and_status_and_completedAt", (q) =>
      q
        .eq("fingerprint", args.fingerprint)
        .eq("status", "completed")
        .gte("completedAt", args.now - JOB_SEARCH_CACHE_TTL_MS),
    )
    .order("desc")
    .first();
  if (cachedRun) {
    const discoveries = await ctx.db
      .query("jobDiscoveries")
      .withIndex("by_searchRunId", (q) => q.eq("searchRunId", cachedRun._id))
      .take(args.maxAcceptedJobs);
    const candidates = [];
    for (const discovery of discoveries) {
      const job = await ctx.db.get("jobs", discovery.jobId);
      if (!job) continue;
      const eligible = await eligibleCandidate(
        ctx,
        job,
        args.profile,
        args.now,
      );
      if (eligible) candidates.push(eligible);
    }
    if (candidates.length) {
      return {
        source: "cache" as const,
        sourceKey: String(cachedRun._id),
        candidates,
      };
    }
  }

  const centralJobs = await ctx.db
    .query("jobs")
    .withIndex("by_lifecycleStatus_and_lastVerifiedAt", (q) =>
      q
        .eq("lifecycleStatus", "verified_active")
        .gte("lastVerifiedAt", args.now - JOB_SOURCE_VERIFICATION_TTL_MS),
    )
    .order("desc")
    .take(50);
  const candidates = [];
  for (const job of centralJobs) {
    const eligible = await eligibleCandidate(ctx, job, args.profile, args.now);
    if (eligible) candidates.push(eligible);
    if (candidates.length === args.maxAcceptedJobs) break;
  }
  if (candidates.length >= CENTRAL_REUSE_MINIMUM_JOBS) {
    return {
      source: "central" as const,
      sourceKey: hashText(
        candidates
          .map(({ job }) => String(job._id))
          .sort()
          .join("|"),
      ),
      candidates,
    };
  }
  return null;
}

async function ensureQueryRecord(
  ctx: MutationCtx,
  args: {
    fingerprint: string;
    normalizedCriteria: string;
    generatedQueries: string[];
  },
  now: number,
) {
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
  return queryRecord;
}

async function decrementGlobalReservation(
  ctx: MutationCtx,
  usage: Doc<"jobSearchUsage">,
  releaseFreshCounts: boolean,
  now: number,
) {
  const counter = await ctx.db
    .query("jobSearchGlobalUsage")
    .withIndex("by_dayKey", (q) => q.eq("dayKey", usage.globalDayKey))
    .unique();
  if (!counter) return;
  await ctx.db.patch("jobSearchGlobalUsage", counter._id, {
    activeRuns: Math.max(0, counter.activeRuns - 1),
    freshRuns: Math.max(0, counter.freshRuns - (releaseFreshCounts ? 1 : 0)),
    queryCount: Math.max(
      0,
      counter.queryCount - (releaseFreshCounts ? usage.queryCount : 0),
    ),
    updatedAt: now,
  });
}

async function recoverStaleRun(
  ctx: MutationCtx,
  run: Doc<"jobSearchRuns">,
  now: number,
) {
  await ctx.db.patch("jobSearchRuns", run._id, {
    status: "failed",
    completedAt: now,
    errorCategory: "run_timeout",
  });
  const reservationId = run.reservationId;
  if (!reservationId) return;
  const usage = await ctx.db
    .query("jobSearchUsage")
    .withIndex("by_reservationId", (q) => q.eq("reservationId", reservationId))
    .first();
  if (!usage || usage.status !== "reserved") return;
  const consumed = usage.providerRequestStarted;
  await ctx.db.patch("jobSearchUsage", usage._id, {
    status: consumed ? "failed" : "released",
    completedAt: now,
  });
  await decrementGlobalReservation(ctx, usage, !consumed, now);
}

async function recordReuse(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    queryRecord: Doc<"jobSearchQueries">;
    fingerprint: string;
    model: string;
    plan: JobSearchPlan;
    candidates: Array<{
      job: Doc<"jobs">;
      quality: ReturnType<typeof evaluateJobQuality>;
    }>;
    source: "cache" | "central";
    sourceKey: string;
    now: number;
  },
) {
  const reservationId = hashText(
    `${args.userId}|${args.fingerprint}|${args.source}|${args.sourceKey}`,
  );
  const existingUsage = await ctx.db
    .query("jobSearchUsage")
    .withIndex("by_reservationId", (q) => q.eq("reservationId", reservationId))
    .first();
  if (existingUsage?.searchRunId) {
    const existingRun = await ctx.db.get(
      "jobSearchRuns",
      existingUsage.searchRunId,
    );
    if (existingRun) {
      return {
        kind: "reused" as const,
        resultSource: args.source,
        runId: existingRun._id,
        acceptedCount: existingRun.acceptedCount,
        plan: args.plan,
      };
    }
  }
  const runId = await ctx.db.insert("jobSearchRuns", {
    userId: args.userId,
    queryId: args.queryRecord._id,
    fingerprint: args.fingerprint,
    status: "reused",
    provider: "openai",
    model: args.model,
    plan: args.plan,
    resultSource: args.source,
    reservationId,
    queryCount: 0,
    webSearchToolCallCount: 0,
    startedAt: args.now,
    completedAt: args.now,
    returnedCandidateCount: 0,
    acceptedCount: args.candidates.length,
    rejectedCount: 0,
    insertedCount: 0,
    deduplicatedCount: args.candidates.length,
  });
  for (const { job, quality } of args.candidates) {
    await ctx.db.insert("jobDiscoveries", {
      jobId: job._id,
      searchRunId: runId,
      userId: args.userId,
      queryId: args.queryRecord._id,
      discoveredAt: args.now,
      reused: true,
    });
    await upsertMatch(ctx, {
      userId: args.userId,
      jobId: job._id,
      runId,
      quality,
      resultSource: args.source,
      now: args.now,
    });
  }
  await ctx.db.insert("jobSearchUsage", {
    userId: args.userId,
    operationType: "job_discovery",
    plan: args.plan,
    searchRunId: runId,
    reservationId,
    status: "completed",
    freshProviderCall: false,
    providerRequestStarted: false,
    resultSource: args.source,
    queryCount: 0,
    webSearchToolCallCount: 0,
    acceptedJobs: args.candidates.length,
    createdAt: args.now,
    completedAt: args.now,
    quotaWindowIdentifier: `${args.source}:${args.sourceKey}`,
    globalDayKey: globalDayKey(args.now),
  });
  return {
    kind: "reused" as const,
    resultSource: args.source,
    runId,
    acceptedCount: args.candidates.length,
    plan: args.plan,
  };
}

const beginResultValidator = v.union(
  v.object({
    kind: v.literal("started"),
    runId: v.id("jobSearchRuns"),
    reservationId: v.string(),
    plan: planValidator,
    maxQueries: v.number(),
    maxAcceptedJobs: v.number(),
  }),
  v.object({
    kind: v.literal("reused"),
    resultSource: v.union(v.literal("cache"), v.literal("central")),
    runId: v.id("jobSearchRuns"),
    acceptedCount: v.number(),
    plan: planValidator,
  }),
);

export const beginSearch = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    fingerprint: v.string(),
    normalizedCriteria: v.string(),
    generatedQueries: v.array(v.string()),
    model: v.string(),
    profile: searchProfileValidator,
    runtime: v.object({
      enabled: v.boolean(),
      globalDailyRunLimit: v.number(),
      globalDailyQueryLimit: v.number(),
      maxConcurrentRuns: v.number(),
      outputTokenLimit: v.number(),
    }),
  },
  returns: beginResultValidator,
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await requireUserId(ctx));
    const now = Date.now();
    const plan = await currentPlan(ctx, userId, now);
    const policy = JOB_SEARCH_PLAN_POLICIES[plan];
    const queryCount = Math.min(
      policy.maxQueriesPerSearch,
      args.generatedQueries.length,
    );
    if (queryCount < 1) profileIncomplete();

    const active = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "running"),
      )
      .first();
    if (active && active.startedAt >= now - JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS) {
      throw new ConvexError({ code: "SEARCH_ALREADY_RUNNING" });
    }
    if (active) await recoverStaleRun(ctx, active, now);

    const queryRecord = await ensureQueryRecord(
      ctx,
      {
        fingerprint: args.fingerprint,
        normalizedCriteria: args.normalizedCriteria,
        generatedQueries: args.generatedQueries.slice(0, queryCount),
      },
      now,
    );
    const reusable = await reusableCandidates(ctx, {
      fingerprint: args.fingerprint,
      profile: args.profile,
      maxAcceptedJobs: policy.maxAcceptedJobsPerSearch,
      now,
    });
    if (reusable) {
      return await recordReuse(ctx, {
        userId,
        queryRecord,
        fingerprint: args.fingerprint,
        model: args.model,
        plan,
        candidates: reusable.candidates,
        source: reusable.source,
        sourceKey: reusable.sourceKey,
        now,
      });
    }

    if (!args.runtime.enabled) {
      throw new ConvexError({ code: "JOB_SEARCH_DISABLED" });
    }
    const windowStart = now - policy.quotaWindowMs;
    const recentUsage = await ctx.db
      .query("jobSearchUsage")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", userId).gte("createdAt", windowStart),
      )
      .order("asc")
      .take(policy.freshSearchesPerWindow + 5);
    const consumingUsage = recentUsage.filter(
      (item) => item.freshProviderCall && item.status !== "released",
    );
    if (consumingUsage.length >= policy.freshSearchesPerWindow) {
      throw new ConvexError({
        code: "SEARCH_QUOTA_EXCEEDED",
        nextAvailableAt: consumingUsage[0].createdAt + policy.quotaWindowMs,
      });
    }
    const latestFresh = [...consumingUsage].sort(
      (a, b) => b.createdAt - a.createdAt,
    )[0];
    if (latestFresh && latestFresh.createdAt + policy.cooldownMs > now) {
      throw new ConvexError({
        code: "SEARCH_COOLDOWN",
        nextAvailableAt: latestFresh.createdAt + policy.cooldownMs,
      });
    }

    const dayKey = globalDayKey(now);
    const globalUsage = await ctx.db
      .query("jobSearchGlobalUsage")
      .withIndex("by_dayKey", (q) => q.eq("dayKey", dayKey))
      .unique();
    const totals = globalUsage ?? {
      freshRuns: 0,
      queryCount: 0,
      activeRuns: 0,
    };
    if (totals.freshRuns + 1 > args.runtime.globalDailyRunLimit) {
      throw new ConvexError({ code: "GLOBAL_DAILY_RUN_LIMIT" });
    }
    if (totals.queryCount + queryCount > args.runtime.globalDailyQueryLimit) {
      throw new ConvexError({ code: "GLOBAL_DAILY_QUERY_LIMIT" });
    }
    if (totals.activeRuns + 1 > args.runtime.maxConcurrentRuns) {
      throw new ConvexError({ code: "GLOBAL_CONCURRENCY_LIMIT" });
    }

    const windowId = quotaWindowIdentifier(
      plan,
      Math.floor(now / policy.quotaWindowMs) * policy.quotaWindowMs,
    );
    const releasedAttempts = recentUsage.filter(
      (item) => item.status === "released",
    ).length;
    const reservationId = hashText(
      `${userId}|${args.fingerprint}|${windowId}|${releasedAttempts}`,
    );
    const previousReservation = await ctx.db
      .query("jobSearchUsage")
      .withIndex("by_reservationId", (q) =>
        q.eq("reservationId", reservationId),
      )
      .first();
    if (previousReservation) {
      throw new ConvexError({ code: "SEARCH_ALREADY_RUNNING" });
    }

    const runId = await ctx.db.insert("jobSearchRuns", {
      userId,
      queryId: queryRecord._id,
      fingerprint: args.fingerprint,
      status: "running",
      provider: "openai",
      model: args.model,
      plan,
      resultSource: "fresh",
      reservationId,
      queryCount,
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
      plan,
      searchRunId: runId,
      reservationId,
      status: "reserved",
      freshProviderCall: true,
      providerRequestStarted: false,
      resultSource: "fresh",
      queryCount,
      webSearchToolCallCount: 0,
      acceptedJobs: 0,
      createdAt: now,
      quotaWindowIdentifier: windowId,
      globalDayKey: dayKey,
    });
    if (globalUsage) {
      await ctx.db.patch("jobSearchGlobalUsage", globalUsage._id, {
        freshRuns: globalUsage.freshRuns + 1,
        queryCount: globalUsage.queryCount + queryCount,
        activeRuns: globalUsage.activeRuns + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("jobSearchGlobalUsage", {
        dayKey,
        freshRuns: 1,
        queryCount,
        activeRuns: 1,
        updatedAt: now,
      });
    }
    return {
      kind: "started" as const,
      runId,
      reservationId,
      plan,
      maxQueries: queryCount,
      maxAcceptedJobs: policy.maxAcceptedJobsPerSearch,
    };
  },
});

export const markProviderStarted = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    runId: v.id("jobSearchRuns"),
    reservationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await requireUserId(ctx));
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    if (
      !run ||
      run.userId !== userId ||
      run.status !== "running" ||
      run.reservationId !== args.reservationId
    ) {
      throw new ConvexError({ code: "INVALID_SEARCH_RUN" });
    }
    const usage = await ctx.db
      .query("jobSearchUsage")
      .withIndex("by_reservationId", (q) =>
        q.eq("reservationId", args.reservationId),
      )
      .unique();
    if (!usage || usage.userId !== userId || usage.status !== "reserved") {
      throw new ConvexError({ code: "INVALID_SEARCH_RESERVATION" });
    }
    await ctx.db.patch("jobSearchUsage", usage._id, {
      providerRequestStarted: true,
    });
    return null;
  },
});

function sourcePriority(source: Doc<"jobSources">) {
  return { employer: 1, ats: 2, job_board: 3, aggregator: 4 }[
    source.sourceTier
  ];
}

function compatibleRequirements(
  job: Doc<"jobs">,
  candidate: {
    requiredSkills: string[];
    requiredExperienceYearsMin: number | null;
  },
) {
  if (
    job.requiredExperienceYearsMin !== null &&
    candidate.requiredExperienceYearsMin !== null &&
    Math.abs(
      job.requiredExperienceYearsMin - candidate.requiredExperienceYearsMin,
    ) > 2
  ) {
    return false;
  }
  if (!job.requiredSkills.length || !candidate.requiredSkills.length)
    return true;
  const left = new Set(job.requiredSkills.map(normalizedKey));
  const right = new Set(candidate.requiredSkills.map(normalizedKey));
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return overlap / Math.min(left.size, right.size) >= 0.5;
}

async function canMergeCandidate(
  ctx: MutationCtx,
  existing: Doc<"jobs">,
  candidate: JobInput,
  verification: VerificationInput,
) {
  if (!compatibleRequirements(existing, candidate)) return false;
  if (!verification.externalJobId) return true;
  const sources = await ctx.db
    .query("jobSources")
    .withIndex("by_jobId", (q) => q.eq("jobId", existing._id))
    .take(20);
  return !sources.some(
    (source) =>
      source.externalJobId &&
      source.externalJobId !== verification.externalJobId,
  );
}

type JobInput = (typeof jobInputValidator)["type"];
type VerificationInput = (typeof sourceVerificationValidator)["type"];

async function findCanonicalJob(
  ctx: MutationCtx,
  job: JobInput,
  verification: VerificationInput,
) {
  if (verification.finalUrl) {
    const byFinalUrl = await ctx.db
      .query("jobSources")
      .withIndex("by_finalUrl", (q) =>
        q.eq("finalUrl", verification.finalUrl ?? undefined),
      )
      .first();
    if (byFinalUrl) {
      return {
        job: await ctx.db.get("jobs", byFinalUrl.jobId),
        reason: "final_url",
      };
    }
  }
  if (verification.externalJobId) {
    const byExternalId = await ctx.db
      .query("jobSources")
      .withIndex("by_domain_and_externalJobId", (q) =>
        q
          .eq("domain", verification.domain)
          .eq("externalJobId", verification.externalJobId ?? undefined),
      )
      .first();
    if (byExternalId) {
      return {
        job: await ctx.db.get("jobs", byExternalId.jobId),
        reason: "external_job_id",
      };
    }
  }
  const bySourceUrl = await ctx.db
    .query("jobSources")
    .withIndex("by_normalizedUrl", (q) =>
      q.eq("normalizedUrl", job.normalizedSourceUrl),
    )
    .first();
  if (bySourceUrl) {
    return {
      job: await ctx.db.get("jobs", bySourceUrl.jobId),
      reason: "normalized_url",
    };
  }
  const byFingerprint = await ctx.db
    .query("jobs")
    .withIndex("by_jobFingerprint", (q) =>
      q.eq("jobFingerprint", job.jobFingerprint),
    )
    .take(5);
  let compatibleFingerprint: Doc<"jobs"> | undefined;
  for (const candidate of byFingerprint) {
    if (await canMergeCandidate(ctx, candidate, job, verification)) {
      compatibleFingerprint = candidate;
      break;
    }
  }
  if (compatibleFingerprint) {
    return { job: compatibleFingerprint, reason: "company_title_location" };
  }
  const byContent = await ctx.db
    .query("jobs")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", job.contentHash))
    .take(5);
  let compatibleContent: Doc<"jobs"> | undefined;
  for (const candidate of byContent) {
    if (
      normalizedKey(candidate.companyName) === normalizedKey(job.companyName) &&
      normalizedKey(candidate.title) === normalizedKey(job.title) &&
      (await canMergeCandidate(ctx, candidate, job, verification))
    ) {
      compatibleContent = candidate;
      break;
    }
  }
  return compatibleContent
    ? { job: compatibleContent, reason: "content_hash" }
    : { job: null, reason: null };
}

async function upsertSource(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    sourceUrl: string;
    normalizedUrl: string;
    verification: VerificationInput;
    duplicateReason: string | null;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("jobSources")
    .withIndex("by_normalizedUrl", (q) =>
      q.eq("normalizedUrl", args.normalizedUrl),
    )
    .first();
  const values = {
    jobId: args.jobId,
    sourceUrl: args.sourceUrl,
    normalizedUrl: args.normalizedUrl,
    finalUrl: args.verification.finalUrl ?? undefined,
    domain: args.verification.domain,
    sourceTier: args.verification.sourceTier,
    externalJobId: args.verification.externalJobId ?? undefined,
    lastSeenAt: args.now,
    lastVerifiedAt: args.verification.verifiedAt,
    activityStatus: args.verification.activityStatus,
    verificationMethod: args.verification.verificationMethod,
    verificationEvidence: args.verification.verificationEvidence,
    duplicateReason: args.duplicateReason ?? undefined,
    canonicalJobId: args.duplicateReason ? args.jobId : undefined,
  } as const;
  if (existing) {
    await ctx.db.patch("jobSources", existing._id, values);
    return existing._id;
  }
  return await ctx.db.insert("jobSources", {
    ...values,
    firstSeenAt: args.now,
  });
}

async function refreshBestSource(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  now: number,
) {
  const activeSources = await ctx.db
    .query("jobSources")
    .withIndex("by_jobId_and_activityStatus", (q) =>
      q.eq("jobId", jobId).eq("activityStatus", "verified_active"),
    )
    .take(20);
  activeSources.sort((a, b) => sourcePriority(a) - sourcePriority(b));
  const best = activeSources[0];
  await ctx.db.patch("jobs", jobId, {
    bestSourceId: best?._id,
    sourceUrl: best?.finalUrl ?? best?.normalizedUrl,
    lastVerifiedAt: best?.lastVerifiedAt,
    lifecycleStatus: best ? "verified_active" : "verification_failed",
    activityStatus: best ? "active" : "inactive",
    lastDiscoveredAt: now,
  });
  return best ?? null;
}

export const completeSearch = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    runId: v.id("jobSearchRuns"),
    reservationId: v.string(),
    returnedCandidateCount: v.number(),
    rejectedCount: v.number(),
    webSearchToolCallCount: v.number(),
    usage: usageValidator,
    jobs: v.array(verifiedJobInputValidator),
    profile: searchProfileValidator,
  },
  returns: v.object({
    acceptedCount: v.number(),
    insertedCount: v.number(),
    deduplicatedCount: v.number(),
    rejectedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await requireUserId(ctx));
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    if (
      !run ||
      run.userId !== userId ||
      run.status !== "running" ||
      run.reservationId !== args.reservationId
    ) {
      throw new ConvexError({ code: "INVALID_SEARCH_RUN" });
    }
    const usageRecord = await ctx.db
      .query("jobSearchUsage")
      .withIndex("by_reservationId", (q) =>
        q.eq("reservationId", args.reservationId),
      )
      .unique();
    if (!usageRecord || usageRecord.status !== "reserved") {
      throw new ConvexError({ code: "INVALID_SEARCH_RESERVATION" });
    }
    const now = Date.now();
    const plan = run.plan ?? "free";
    const maxJobs = JOB_SEARCH_PLAN_POLICIES[plan].maxAcceptedJobsPerSearch;
    let insertedCount = 0;
    let deduplicatedCount = 0;
    let eligibleCount = 0;
    let qualityRejectedCount = 0;
    const seenJobs = new Set<Id<"jobs">>();
    for (const { job, verification } of args.jobs.slice(0, maxJobs)) {
      const canonical = await findCanonicalJob(ctx, job, verification);
      let centralJob = canonical.job;
      let jobId: Id<"jobs">;
      if (centralJob) {
        jobId = centralJob._id;
        deduplicatedCount += 1;
        if (centralJob.contentHash !== job.contentHash) {
          await ctx.db.patch("jobs", jobId, {
            ...job,
            firstDiscoveredAt: centralJob.firstDiscoveredAt,
            lastDiscoveredAt: now,
            lifecycleStatus: centralJob.lifecycleStatus,
            activityStatus: centralJob.activityStatus,
            bestSourceId: centralJob.bestSourceId,
          });
        }
      } else {
        jobId = await ctx.db.insert("jobs", {
          ...job,
          firstDiscoveredAt: now,
          lastDiscoveredAt: now,
          lastVerifiedAt:
            verification.activityStatus === "verified_active"
              ? verification.verifiedAt
              : undefined,
          activityStatus:
            verification.activityStatus === "verified_active"
              ? "active"
              : "inactive",
          lifecycleStatus:
            verification.activityStatus === "verified_active"
              ? "verified_active"
              : verification.activityStatus,
        });
        insertedCount += 1;
      }
      await upsertSource(ctx, {
        jobId,
        sourceUrl: job.sourceUrl,
        normalizedUrl: job.normalizedSourceUrl,
        verification,
        duplicateReason: canonical.reason,
        now,
      });
      const bestSource = await refreshBestSource(ctx, jobId, now);
      centralJob = await ctx.db.get("jobs", jobId);
      if (!centralJob) continue;

      const quality = evaluateJobQuality(centralJob, args.profile);
      if (
        !bestSource &&
        !quality.exclusionReasons.includes("not_verified_active")
      ) {
        quality.outcome = "excluded";
        quality.exclusionReasons.unshift("not_verified_active");
      }
      const alreadySeen = seenJobs.has(jobId);
      if (!alreadySeen) {
        if (quality.outcome === "eligible") eligibleCount += 1;
        else qualityRejectedCount += 1;
      }
      await upsertMatch(ctx, {
        userId,
        jobId,
        runId: run._id,
        quality,
        resultSource: "fresh",
        now,
      });
      if (alreadySeen) continue;
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
    const totalRejected = args.rejectedCount + qualityRejectedCount;
    await ctx.db.patch("jobSearchRuns", run._id, {
      status: "completed",
      completedAt: now,
      resultSource: "fresh",
      usage: args.usage,
      webSearchToolCallCount: args.webSearchToolCallCount,
      returnedCandidateCount: args.returnedCandidateCount,
      acceptedCount: eligibleCount,
      rejectedCount: totalRejected,
      insertedCount,
      deduplicatedCount,
    });
    await ctx.db.patch("jobSearchQueries", run.queryId, {
      lastSuccessfulRunAt: now,
    });
    await ctx.db.patch("jobSearchUsage", usageRecord._id, {
      status: "completed",
      completedAt: now,
      webSearchToolCallCount: args.webSearchToolCallCount,
      inputTokens: args.usage.inputTokens,
      outputTokens: args.usage.outputTokens,
      totalTokens: args.usage.totalTokens,
      acceptedJobs: eligibleCount,
    });
    await decrementGlobalReservation(ctx, usageRecord, false, now);
    return {
      acceptedCount: eligibleCount,
      insertedCount,
      deduplicatedCount,
      rejectedCount: totalRejected,
    };
  },
});

export const failSearch = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    runId: v.id("jobSearchRuns"),
    reservationId: v.string(),
    errorCategory: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await requireUserId(ctx));
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    if (run?.userId !== userId || run.status !== "running") return null;
    const now = Date.now();
    const usage = await ctx.db
      .query("jobSearchUsage")
      .withIndex("by_reservationId", (q) =>
        q.eq("reservationId", args.reservationId),
      )
      .first();
    await ctx.db.patch("jobSearchRuns", run._id, {
      status: "failed",
      completedAt: now,
      errorCategory: args.errorCategory.slice(0, 80),
    });
    if (usage?.status === "reserved") {
      const consumed = usage.providerRequestStarted;
      await ctx.db.patch("jobSearchUsage", usage._id, {
        status: consumed ? "failed" : "released",
        completedAt: now,
      });
      await decrementGlobalReservation(ctx, usage, !consumed, now);
    }
    return null;
  },
});

export const getCurrentUserDiscoveryState = query({
  args: {},
  returns: v.object({
    plan: planValidator,
    remainingFreshSearches: v.number(),
    nextAvailableAt: v.union(v.number(), v.null()),
    searchEnabled: v.boolean(),
    reuseAvailable: v.boolean(),
    runActive: v.boolean(),
    lastSuccessfulSearchAt: v.union(v.number(), v.null()),
    lastResultSource: v.union(resultSourceValidator, v.null()),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const plan = await currentPlan(ctx, userId, now);
    const policy = JOB_SEARCH_PLAN_POLICIES[plan];
    let reuseAvailable = false;
    try {
      const profile = await loadSearchProfile(ctx, userId);
      const searchPlan = buildSearchPlan(profile);
      reuseAvailable = Boolean(
        await reusableCandidates(ctx, {
          fingerprint: searchPlan.fingerprint,
          profile,
          maxAcceptedJobs: policy.maxAcceptedJobsPerSearch,
          now,
        }),
      );
    } catch {
      reuseAvailable = false;
    }
    const usage = await ctx.db
      .query("jobSearchUsage")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", userId).gte("createdAt", now - policy.quotaWindowMs),
      )
      .order("asc")
      .take(policy.freshSearchesPerWindow + 5);
    const consuming = usage.filter(
      (item) => item.freshProviderCall && item.status !== "released",
    );
    const active = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "running"),
      )
      .first();
    const recentRuns = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    const lastSuccessful = recentRuns.find(
      (run) => run.status === "completed" || run.status === "reused",
    );
    let enabled = false;
    try {
      enabled = parseJobSearchRuntimeConfig(env).enabled;
    } catch {
      enabled = false;
    }
    return {
      plan,
      remainingFreshSearches: Math.max(
        0,
        policy.freshSearchesPerWindow - consuming.length,
      ),
      nextAvailableAt:
        consuming.length >= policy.freshSearchesPerWindow
          ? consuming[0].createdAt + policy.quotaWindowMs
          : null,
      searchEnabled: enabled,
      reuseAvailable,
      runActive: Boolean(
        active && active.startedAt >= now - JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS,
      ),
      lastSuccessfulSearchAt: lastSuccessful?.completedAt ?? null,
      lastResultSource: lastSuccessful?.resultSource ?? null,
    };
  },
});

export const listCurrentUserJobs = query({
  args: {
    view: v.optional(
      v.union(v.literal("suggestions"), v.literal("inProgress")),
    ),
  },
  returns: v.object({
    jobs: v.array(jobFeedItem),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.view === "inProgress") {
      const applications = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_appliedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100);
      return {
        jobs: applications.map((item) => ({
          ...item.snapshot,
          appliedAt: item.appliedAt,
        })),
      };
    }
    const matches = await ctx.db
      .query("jobMatches")
      .withIndex("by_userId_and_outcome_and_relevanceScore", (q) =>
        q.eq("userId", userId).eq("outcome", "eligible"),
      )
      .order("desc")
      .take(50);
    const now = Date.now();
    const jobs = [];
    for (const match of matches) {
      const application = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", match.jobId),
        )
        .unique();
      if (application) continue;
      const job = await ctx.db.get("jobs", match.jobId);
      if (
        !job ||
        !isDisplayEligibleJob(job) ||
        !job.bestSourceId ||
        !job.lastVerifiedAt ||
        job.lastVerifiedAt < now - JOB_SOURCE_VERIFICATION_TTL_MS
      ) {
        continue;
      }
      const source = await ctx.db.get("jobSources", job.bestSourceId);
      if (
        !source ||
        source.activityStatus !== "verified_active" ||
        !source.finalUrl ||
        !source.lastVerifiedAt
      ) {
        continue;
      }
      jobs.push({
        id: job._id,
        title: job.title,
        companyName: job.companyName,
        sourceUrl: source.finalUrl,
        sourceName: job.sourceName,
        sourceTier: source.sourceTier,
        locationText: job.locationText,
        workArrangement: job.workArrangement,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        discoveredAt: match.evaluatedAt,
        lastVerifiedAt: source.lastVerifiedAt,
        relevanceScore: match.relevanceScore,
        matchReasons: match.matchReasons,
        resultSource: match.resultSource,
      });
      if (jobs.length === 25) break;
    }
    return { jobs };
  },
});

// The server is authoritative for both visibility and the manual action gate.
export const developmentToolsEnabled = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return env.DEV_TOOLS_ENABLED === "true";
  },
});

export const setApplicationStatus = mutation({
  args: { jobId: v.id("jobs"), applied: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("jobApplications")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", args.jobId),
      )
      .unique();
    if (!args.applied) {
      if (existing) await ctx.db.delete("jobApplications", existing._id);
      return null;
    }
    if (existing) return null;
    const match = await ctx.db
      .query("jobMatches")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", args.jobId),
      )
      .unique();
    const job = await ctx.db.get("jobs", args.jobId);
    if (
      !match ||
      match.outcome !== "eligible" ||
      !job ||
      !isDisplayEligibleJob(job) ||
      !job.bestSourceId ||
      !job.lastVerifiedAt ||
      job.lastVerifiedAt < Date.now() - JOB_SOURCE_VERIFICATION_TTL_MS
    ) {
      throw new ConvexError({ code: "JOB_NOT_AVAILABLE" });
    }
    const source = await ctx.db.get("jobSources", job.bestSourceId);
    if (
      !source ||
      source.activityStatus !== "verified_active" ||
      !source.finalUrl ||
      !source.lastVerifiedAt
    )
      throw new ConvexError({ code: "JOB_NOT_AVAILABLE" });
    await ctx.db.insert("jobApplications", {
      userId,
      jobId: args.jobId,
      appliedAt: Date.now(),
      snapshot: {
        id: job._id,
        title: job.title,
        companyName: job.companyName,
        sourceUrl: source.finalUrl,
        sourceName: job.sourceName,
        sourceTier: source.sourceTier,
        locationText: job.locationText,
        workArrangement: job.workArrangement,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        discoveredAt: match.evaluatedAt,
        lastVerifiedAt: source.lastVerifiedAt,
        relevanceScore: match.relevanceScore,
        matchReasons: match.matchReasons,
        resultSource: match.resultSource,
      },
    });
    return null;
  },
});

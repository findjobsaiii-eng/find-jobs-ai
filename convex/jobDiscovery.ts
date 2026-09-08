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
import {
  deriveJobLifecycle,
  isActiveFeedLifecycle,
  JOB_ACTIVITY_POLICY,
  retryDelayMs,
} from "./jobActivityPolicy";
import type { SearchProfile } from "./jobDiscoveryModel";
import { normalizedKey } from "./jobDiscoveryModel";
import {
  globalDayKey,
  JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS,
  type JobSearchPlan,
} from "./jobSearchPolicy";

const planValidator = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("admin"),
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
  normalizedPastRoles: v.optional(v.array(v.string())),
  currentRole: v.optional(v.string()),
  seniority: v.optional(v.string()),
  professionalDomains: v.optional(v.array(v.string())),
  experienceByDomain: v.optional(
    v.array(v.object({ domain: v.string(), months: v.number() })),
  ),
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
  rawSourceText: v.optional(v.string()),
});
const jobInputValidator = v.object({
  rawProviderJson: v.optional(v.string()),
  geo: v.optional(
    v.object({
      placeId: v.string(),
      countryCode: v.string(),
      latitude: v.number(),
      longitude: v.number(),
      precision: v.literal("locality_centroid"),
    }),
  ),
  normalizedSourceUrl: v.string(),
  canonicalKey: v.string(),
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
const auditScoreComponentsValidator = v.object({
  role: v.number(),
  requiredSkills: v.number(),
  preferredSkills: v.number(),
  experience: v.number(),
  location: v.number(),
  workArrangement: v.number(),
  employmentType: v.number(),
  language: v.number(),
  education: v.number(),
  semantic: v.number(),
  domain: v.number(),
  seniority: v.number(),
  preferences: v.number(),
});
const matchAuditValidator = v.object({
  profile: searchProfileValidator,
  counts: v.object({
    centralJobs: v.number(),
    activeAndCanonical: v.number(),
    hardEligible: v.number(),
    aboveThreshold: v.number(),
    displayed: v.number(),
  }),
  candidates: v.array(
    v.object({
      rank: v.number(),
      jobId: v.id("jobs"),
      title: v.string(),
      companyName: v.string(),
      relevanceScore: v.number(),
      scoreComponents: auditScoreComponentsValidator,
      exclusionReasons: v.array(v.string()),
      matchReasons: v.array(v.string()),
      sourceTier: v.union(
        v.literal("employer"),
        v.literal("ats"),
        v.literal("job_board"),
        v.literal("aggregator"),
        v.null(),
      ),
      decision: v.union(
        v.literal("strong"),
        v.literal("acceptable"),
        v.literal("reject"),
      ),
    }),
  ),
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
    !profile.preferredPlaceIds?.[0] ||
    profile.locationRadiusKm === undefined
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
    Promise.all(
      (profile.skillIds ?? []).map((id) => ctx.db.get("catalogItems", id)),
    ),
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
  if (!targetJobTitles.length) profileIncomplete();
  return {
    targetJobTitles,
    skills: selectedSkills,
    yearsOfExperience: profile.yearsOfExperience ?? 0,
    location: profile.primaryLocation,
    workArrangements: profile.workArrangements?.length
      ? profile.workArrangements
      : ["onsite", "hybrid", "remote"],
    employmentTypes: profile.employmentTypes?.length
      ? profile.employmentTypes
      : ["full-time", "part-time", "contract"],
    languages: profile.languages ?? [],
    minimumMonthlySalaryIls: profile.minimumMonthlySalaryIls ?? 0,
    normalizedPastRoles: profile.cvCareerProfile?.normalizedPastRoles ?? [],
    currentRole: profile.cvCareerProfile?.currentTitle,
    seniority: profile.seniority,
    professionalDomains: profile.cvCareerProfile?.domains ?? [],
    experienceByDomain: profile.cvCareerProfile?.experienceByDomain ?? [],
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
  if (!run.manual) {
    const query = await ctx.db.get("jobSearchQueries", run.queryId);
    if (query?.lastAttemptRunId === run._id) {
      await ctx.db.patch("jobSearchQueries", query._id, {
        lastAttemptDay: undefined,
        lastAttemptRunId: undefined,
      });
    }
  }
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

export const getUserPlan = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  returns: planValidator,
  handler: (ctx, args) => currentPlan(ctx, args.userId, args.now),
});

export const beginSearch = internalMutation({
  args: {
    userId: v.id("users"),
    fingerprint: v.string(),
    normalizedCriteria: v.string(),
    generatedQueries: v.array(v.string()),
    model: v.string(),
    manual: v.boolean(),
    runtime: v.object({
      enabled: v.boolean(),
      globalDailyRunLimit: v.number(),
      globalDailyQueryLimit: v.number(),
      maxConcurrentRuns: v.number(),
      outputTokenLimit: v.number(),
    }),
  },
  returns: v.union(
    v.null(),
    v.object({
      runId: v.id("jobSearchRuns"),
      reservationId: v.string(),
      plan: planValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const plan = await currentPlan(ctx, args.userId, now);
    if (plan === "free") return null;
    if (args.manual && env.DEV_TOOLS_ENABLED !== "true")
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    if (!args.manual && !args.runtime.enabled)
      throw new ConvexError({ code: "JOB_SEARCH_DISABLED" });
    const record = await ensureQueryRecord(ctx, args, now);
    const dayKey = globalDayKey(now);
    if (!args.manual && record.lastAttemptDay === dayKey) return null;
    const active = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "running"),
      )
      .first();
    if (active && active.startedAt >= now - JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS)
      throw new ConvexError({ code: "SEARCH_ALREADY_RUNNING" });
    if (active) await recoverStaleRun(ctx, active, now);
    const globalUsage = await ctx.db
      .query("jobSearchGlobalUsage")
      .withIndex("by_dayKey", (q) => q.eq("dayKey", dayKey))
      .unique();
    const totals = globalUsage ?? {
      freshRuns: 0,
      queryCount: 0,
      activeRuns: 0,
    };
    if (!args.manual) {
      if (totals.freshRuns >= args.runtime.globalDailyRunLimit)
        throw new ConvexError({ code: "GLOBAL_DAILY_RUN_LIMIT" });
      if (totals.queryCount >= args.runtime.globalDailyQueryLimit)
        throw new ConvexError({ code: "GLOBAL_DAILY_QUERY_LIMIT" });
      if (totals.activeRuns >= args.runtime.maxConcurrentRuns)
        throw new ConvexError({ code: "GLOBAL_CONCURRENCY_LIMIT" });
    }
    const runId = await ctx.db.insert("jobSearchRuns", {
      userId: args.userId,
      queryId: record._id,
      fingerprint: args.fingerprint,
      status: "running",
      provider: "openai",
      model: args.model,
      plan,
      manual: args.manual,
      resultSource: "fresh",
      queryCount: 1,
      webSearchToolCallCount: 0,
      startedAt: now,
      returnedCandidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      insertedCount: 0,
      deduplicatedCount: 0,
    });
    const reservationId = String(runId);
    await ctx.db.patch("jobSearchRuns", runId, { reservationId });
    await ctx.db.insert("jobSearchUsage", {
      userId: args.userId,
      operationType: "job_discovery",
      plan,
      searchRunId: runId,
      reservationId,
      status: "reserved",
      freshProviderCall: true,
      providerRequestStarted: false,
      resultSource: "fresh",
      queryCount: 1,
      webSearchToolCallCount: 0,
      acceptedJobs: 0,
      createdAt: now,
      quotaWindowIdentifier: dayKey,
      globalDayKey: dayKey,
    });
    if (!args.manual) {
      // Atomic daily claim prevents two users dispatching the same provider query.
      await ctx.db.patch("jobSearchQueries", record._id, {
        lastAttemptDay: dayKey,
        lastAttemptRunId: runId,
      });
      const values = {
        dayKey,
        freshRuns: totals.freshRuns + 1,
        queryCount: totals.queryCount + 1,
        activeRuns: totals.activeRuns + 1,
        updatedAt: now,
      };
      if (globalUsage)
        await ctx.db.patch("jobSearchGlobalUsage", globalUsage._id, values);
      else await ctx.db.insert("jobSearchGlobalUsage", values);
    }
    return { runId, reservationId, plan };
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
  const conflictingSameProvider = sources.some(
    (source) =>
      source.domain === verification.domain &&
      source.externalJobId &&
      source.externalJobId !== verification.externalJobId,
  );
  return (
    !conflictingSameProvider || existing.contentHash === candidate.contentHash
  );
}

type JobInput = (typeof jobInputValidator)["type"];
type VerificationInput = (typeof sourceVerificationValidator)["type"];

async function findCanonicalJob(
  ctx: MutationCtx,
  job: JobInput,
  verification: VerificationInput,
) {
  const providerKey = verification.externalJobId
    ? `${verification.domain}:${verification.externalJobId}`
    : null;
  if (providerKey) {
    const byProviderKey = await ctx.db
      .query("jobSources")
      .withIndex("by_providerKey", (q) => q.eq("providerKey", providerKey))
      .first();
    if (byProviderKey) {
      return {
        job: await ctx.db.get("jobs", byProviderKey.jobId),
        reason: "provider_job_id",
      };
    }
  }
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
  const byCanonicalKey = await ctx.db
    .query("jobs")
    .withIndex("by_canonicalKey", (q) => q.eq("canonicalKey", job.canonicalKey))
    .take(5);
  for (const candidate of byCanonicalKey) {
    if (await canMergeCandidate(ctx, candidate, job, verification)) {
      return { job: candidate, reason: "canonical_company_title_location" };
    }
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
    const sameLocation =
      (candidate.geo?.placeId !== undefined &&
        candidate.geo.placeId === job.geo?.placeId) ||
      normalizedKey(candidate.city ?? candidate.locationText ?? "") ===
        normalizedKey(job.city ?? job.locationText ?? "");
    if (
      normalizedKey(candidate.companyName) === normalizedKey(job.companyName) &&
      normalizedKey(candidate.title) === normalizedKey(job.title) &&
      sameLocation &&
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
    sourceName: string | null;
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
  const providerKey = args.verification.externalJobId
    ? `${args.verification.domain}:${args.verification.externalJobId}`
    : undefined;
  const byProviderKey = providerKey
    ? await ctx.db
        .query("jobSources")
        .withIndex("by_providerKey", (q) => q.eq("providerKey", providerKey))
        .first()
    : null;
  const existingSource = existing ?? byProviderKey;
  const temporaryFailure =
    args.verification.activityStatus === "verification_failed";
  const failureCount = temporaryFailure
    ? (existingSource?.verificationFailureCount ?? 0) + 1
    : 0;
  const values = {
    jobId: args.jobId,
    sourceName: args.sourceName,
    sourceUrl: args.sourceUrl,
    normalizedUrl: args.normalizedUrl,
    finalUrl: temporaryFailure
      ? existingSource?.finalUrl
      : (args.verification.finalUrl ?? undefined),
    domain: args.verification.domain,
    sourceTier: args.verification.sourceTier,
    externalJobId: args.verification.externalJobId ?? undefined,
    providerKey,
    lastSeenAt: args.now,
    lastVerificationAttemptAt: args.verification.verifiedAt,
    nextVerificationAt: temporaryFailure
      ? args.now + retryDelayMs(failureCount)
      : args.now + JOB_ACTIVITY_POLICY.activeVerificationTtlMs,
    verificationFailureCount: failureCount,
    verificationLeaseUntil: undefined,
    lastVerifiedAt: temporaryFailure
      ? existingSource?.lastVerifiedAt
      : args.verification.verifiedAt,
    activityStatus: temporaryFailure
      ? (existingSource?.activityStatus ?? "verification_failed")
      : args.verification.activityStatus,
    verificationMethod: args.verification.verificationMethod,
    verificationEvidence: args.verification.verificationEvidence,
    rawSourceText: temporaryFailure
      ? existingSource?.rawSourceText
      : args.verification.rawSourceText,
    closedAt: temporaryFailure
      ? existingSource?.closedAt
      : args.verification.activityStatus === "inactive"
        ? args.verification.verifiedAt
        : undefined,
    closureReason: temporaryFailure
      ? existingSource?.closureReason
      : args.verification.activityStatus === "inactive"
        ? args.verification.verificationEvidence
        : undefined,
    duplicateReason: args.duplicateReason ?? undefined,
    canonicalJobId: args.duplicateReason ? args.jobId : undefined,
  } as const;
  if (existingSource) {
    await ctx.db.patch("jobSources", existingSource._id, values);
    return existingSource._id;
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
  const job = await ctx.db.get("jobs", jobId);
  if (!job) return null;
  const allSources = await ctx.db
    .query("jobSources")
    .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
    .take(50);
  const activeSources = allSources.filter(
    (source) => source.activityStatus === "verified_active",
  );
  activeSources.sort((a, b) => sourcePriority(a) - sourcePriority(b));
  const best = activeSources[0];
  const lifecycle = deriveJobLifecycle({
    sources: allSources,
    lastSeenAt: job.lastDiscoveredAt,
    applicationDeadline: job.applicationDeadline,
    now,
  });
  await ctx.db.patch("jobs", jobId, {
    bestSourceId: best?._id,
    ...(best ? { sourceUrl: best.finalUrl ?? best.normalizedUrl } : {}),
    lastVerifiedAt: best?.lastVerifiedAt,
    lifecycleStatus: lifecycle.status,
    activityStatus: isActiveFeedLifecycle(lifecycle.status)
      ? "active"
      : lifecycle.status === "unknown"
        ? "unknown"
        : "inactive",
    activityReason: lifecycle.reason,
    closedAt: lifecycle.closedAt,
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
    const maxJobs = 10;
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
      const sourceId = await upsertSource(ctx, {
        jobId,
        sourceUrl: job.sourceUrl,
        sourceName: job.sourceName,
        normalizedUrl: job.normalizedSourceUrl,
        verification,
        duplicateReason: canonical.reason,
        now,
      });
      await ctx.db.insert("jobIngestionEvents", {
        jobId,
        sourceId,
        sourceUrl: job.sourceUrl,
        providerKey: verification.externalJobId
          ? `${verification.domain}:${verification.externalJobId}`
          : undefined,
        contentHash: job.contentHash,
        rawProviderJson: job.rawProviderJson,
        mergeReason: canonical.reason ?? undefined,
        observedAt: now,
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
    if (!run.manual) {
      const query = await ctx.db.get("jobSearchQueries", run.queryId);
      if (query?.lastAttemptRunId === run._id) {
        await ctx.db.patch("jobSearchQueries", query._id, {
          lastAttemptDay: undefined,
          lastAttemptRunId: undefined,
        });
      }
    }
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
    runActive: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const entitlement = await ctx.db
      .query("userEntitlements")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const recent = await ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    return {
      plan: entitlement.find((e) => e.active)?.plan ?? "free",
      runActive: recent.some((r) => r.status === "running"),
    };
  },
});

export const setDevelopmentPlan = mutation({
  args: { plan: v.union(v.literal("free"), v.literal("pro")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (env.DEV_TOOLS_ENABLED !== "true")
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    const existing = await ctx.db
      .query("userEntitlements")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const [current, ...older] = existing;
    for (const row of older)
      await ctx.db.patch("userEntitlements", row._id, {
        active: false,
        updatedAt: Date.now(),
      });
    const now = Date.now();
    if (current) {
      await ctx.db.patch("userEntitlements", current._id, {
        plan: args.plan,
        active: true,
        expiresAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userEntitlements", {
        userId,
        plan: args.plan,
        active: true,
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

async function feedItem(
  ctx: QueryCtx | MutationCtx,
  job: Doc<"jobs">,
  profile: SearchProfile,
) {
  const quality = evaluateJobQuality(job, profile);
  if (
    !isDisplayEligibleJob(job) ||
    quality.outcome !== "eligible" ||
    !job.bestSourceId
  )
    return null;
  const source = await ctx.db.get("jobSources", job.bestSourceId);
  if (
    !source ||
    source.activityStatus !== "verified_active" ||
    !source.finalUrl ||
    !source.lastVerifiedAt
  )
    return null;
  return {
    appliedAt: undefined,
    id: job._id,
    title: job.title,
    companyName: job.companyName,
    descriptionText: job.descriptionText,
    requiredSkills: job.requiredSkills.slice(0, 6),
    postedAt: job.postedAt,
    unavailable: false,
    sourceUrl: source.finalUrl,
    sourceName: source.sourceName ?? source.domain ?? null,
    sourceTier: source.sourceTier,
    locationText: job.locationText,
    workArrangement: job.workArrangement,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    discoveredAt: job.firstDiscoveredAt,
    lastVerifiedAt: source.lastVerifiedAt,
    relevanceScore: quality.relevanceScore,
    matchReasons: quality.matchReasons,
    matchHighlights: quality.matchDetails,
    resultSource: "central" as const,
  };
}

function jobFreshness(job: { postedAt?: string | null; discoveredAt: number }) {
  const parsed = job.postedAt ? Date.parse(job.postedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : job.discoveredAt;
}

function feedSourcePriority(tier: string) {
  return { employer: 4, ats: 3, job_board: 2, aggregator: 1 }[tier] ?? 0;
}

export const listCurrentUserJobs = query({
  args: {
    view: v.optional(
      v.union(v.literal("suggestions"), v.literal("inProgress")),
    ),
  },
  returns: v.object({ jobs: v.array(jobFeedItem) }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.view === "inProgress") {
      const applications = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_appliedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100);
      const jobs = await Promise.all(
        applications.map(async (application) => {
          const current = await ctx.db.get("jobs", application.jobId);
          return {
            ...application.snapshot,
            appliedAt: application.appliedAt,
            unavailable: !current || !isDisplayEligibleJob(current),
          };
        }),
      );
      return { jobs };
    }
    let profile: SearchProfile;
    try {
      profile = await loadSearchProfile(ctx, userId);
    } catch {
      return { jobs: [] };
    }
    const [verified, probable] = await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt", (q) =>
          q.eq("lifecycleStatus", "verified_active"),
        )
        .order("desc")
        .take(400),
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt", (q) =>
          q.eq("lifecycleStatus", "probably_active"),
        )
        .order("desc")
        .take(100),
    ]);
    const candidates = [...verified, ...probable].sort(
      (a, b) =>
        (b.postedAt ? Date.parse(b.postedAt) || 0 : b.firstDiscoveredAt) -
        (a.postedAt ? Date.parse(a.postedAt) || 0 : a.firstDiscoveredAt),
    );
    const jobs = [];
    for (const job of candidates) {
      const item = await feedItem(ctx, job, profile);
      if (!item) continue;
      const applied = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", userId).eq("jobId", job._id),
        )
        .unique();
      if (!applied) jobs.push(item);
      if (jobs.length === 50) break;
    }
    jobs.sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        jobFreshness(b) - jobFreshness(a) ||
        feedSourcePriority(b.sourceTier) - feedSourcePriority(a.sourceTier),
    );
    return { jobs };
  },
});

export const getCurrentUserMatchAudit = query({
  args: {},
  returns: matchAuditValidator,
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (env.DEV_TOOLS_ENABLED !== "true")
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    const profile = await loadSearchProfile(ctx, userId);
    const [centralJobs, applications] = await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
        .order("desc")
        .take(500),
      ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_appliedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100),
    ]);
    const appliedJobIds = new Set(applications.map((item) => item.jobId));
    const evaluated = await Promise.all(
      centralJobs.map(async (job) => {
        const quality = evaluateJobQuality(job, profile);
        const source = job.bestSourceId
          ? await ctx.db.get("jobSources", job.bestSourceId)
          : null;
        const activeAndCanonical = Boolean(
          isDisplayEligibleJob(job) &&
          source?.activityStatus === "verified_active" &&
          source.finalUrl &&
          source.lastVerifiedAt,
        );
        const exclusionReasons = [
          ...(!activeAndCanonical ? ["inactive_or_unverified"] : []),
          ...quality.exclusionReasons,
        ];
        const accepted = activeAndCanonical && quality.outcome === "eligible";
        return {
          job,
          source,
          quality,
          activeAndCanonical,
          exclusionReasons,
          accepted,
          displayed: accepted && !appliedJobIds.has(job._id),
        };
      }),
    );
    evaluated.sort(
      (a, b) =>
        b.quality.relevanceScore - a.quality.relevanceScore ||
        jobFreshness({
          postedAt: b.job.postedAt,
          discoveredAt: b.job.firstDiscoveredAt,
        }) -
          jobFreshness({
            postedAt: a.job.postedAt,
            discoveredAt: a.job.firstDiscoveredAt,
          }) ||
        feedSourcePriority(b.source?.sourceTier ?? "") -
          feedSourcePriority(a.source?.sourceTier ?? ""),
    );
    return {
      profile,
      counts: {
        centralJobs: centralJobs.length,
        activeAndCanonical: evaluated.filter((item) => item.activeAndCanonical)
          .length,
        hardEligible: evaluated.filter(
          (item) =>
            item.activeAndCanonical && item.quality.hardEligibilityPassed,
        ).length,
        aboveThreshold: evaluated.filter((item) => item.accepted).length,
        displayed: Math.min(
          50,
          evaluated.filter((item) => item.displayed).length,
        ),
      },
      candidates: evaluated.slice(0, 20).map((item, index) => ({
        rank: index + 1,
        jobId: item.job._id,
        title: item.job.title,
        companyName: item.job.companyName,
        relevanceScore: item.quality.relevanceScore,
        scoreComponents: item.quality.scoreComponents,
        exclusionReasons: item.exclusionReasons,
        matchReasons: item.quality.matchReasons,
        sourceTier: item.source?.sourceTier ?? null,
        decision: item.accepted
          ? item.quality.relevanceScore >= 78
            ? ("strong" as const)
            : ("acceptable" as const)
          : ("reject" as const),
      })),
    };
  },
});

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
    const job = await ctx.db.get("jobs", args.jobId);
    const item = job
      ? await feedItem(ctx, job, await loadSearchProfile(ctx, userId))
      : null;
    if (!item) throw new ConvexError({ code: "JOB_NOT_AVAILABLE" });
    await ctx.db.insert("jobApplications", {
      userId,
      jobId: args.jobId,
      appliedAt: Date.now(),
      snapshot: item,
    });
    return null;
  },
});

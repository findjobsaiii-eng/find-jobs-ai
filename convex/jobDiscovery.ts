import { jobFeedItem } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  env,
  mutation,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { evaluateJobQuality, isDisplayEligibleJob } from "./jobQuality";
import {
  activityReasonForLifecycle,
  deriveJobLifecycle,
  isFreshActiveSource,
  isActiveFeedLifecycle,
  JOB_ACTIVITY_POLICY,
  retryDelayMs,
} from "./jobActivityPolicy";
import type { SearchProfile } from "./jobDiscoveryModel";
import { normalizedKey, normalizePublicUrl } from "./jobDiscoveryModel";
import { locationNamesForGeography } from "./jobGeography";
import {
  isDevelopmentFixtureJob,
  isUserFacingJobSource,
} from "./jobSourceProvenance";
import {
  globalDayKey,
  JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS,
  resolveJobSearchPlan,
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
  targetRoleVariants: v.optional(
    v.array(v.object({ title: v.string(), aliases: v.array(v.string()) })),
  ),
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
    v.literal("unknown"),
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
  verificationMethod: v.union(
    v.literal("http_content_v1"),
    v.literal("http_content_v2"),
  ),
  verificationEvidence: v.string(),
  activeEvidenceType: v.union(v.string(), v.null()),
  identityMatched: v.boolean(),
  applicationAvailable: v.boolean(),
  structuredDatePosted: v.union(v.string(), v.null()),
  structuredValidThrough: v.union(v.string(), v.null()),
  structuredJobIdentifier: v.union(v.string(), v.null()),
  pageTitle: v.union(v.string(), v.null()),
  redirected: v.boolean(),
  rawSourceText: v.optional(v.string()),
  httpStatus: v.optional(v.number()),
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
      labelEn: v.string(),
      labelHe: v.string(),
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
    canonicalRealJobs: v.number(),
    realSourceJobs: v.number(),
    activityEligible: v.number(),
    afterDedupe: v.number(),
    insideLocation: v.number(),
    professionalEligible: v.number(),
    scoredForRelevance: v.number(),
    aboveThreshold: v.number(),
    displayed: v.number(),
  }),
  rejectionReasons: v.array(
    v.object({ reason: v.string(), count: v.number() }),
  ),
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
  return resolveJobSearchPlan(entitlements, now);
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
    targetRoleVariants: titles.flatMap((item) => {
      const title = label(item);
      if (!title) return [];
      return [
        {
          title,
          aliases:
            item?.visibility === "public"
              ? [item.labelHe, ...(item.aliases ?? [])].filter(
                  (value): value is string => Boolean(value),
                )
              : [],
        },
      ];
    }),
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

const ATS_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "recruitee.com",
] as const;
const JOB_BOARD_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "alljobs.co.il",
  "drushim.co.il",
] as const;

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function inferredSourceTier(
  normalizedUrl: string,
  declared?: "employer" | "ats" | "job_board" | "other",
): Doc<"jobSources">["sourceTier"] {
  const hostname = new URL(normalizedUrl).hostname.toLocaleLowerCase("en-US");
  if (ATS_HOSTS.some((domain) => hostMatches(hostname, domain))) return "ats";
  if (JOB_BOARD_HOSTS.some((domain) => hostMatches(hostname, domain))) {
    return "job_board";
  }
  if (declared === "ats" || declared === "job_board") return declared;
  if (declared === "other") return "aggregator";
  // A public posting on an otherwise unknown company domain is the best
  // available employer-source candidate; verification still gates display.
  return "employer";
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
    lastVerificationHttpStatus: args.verification.httpStatus,
    nextVerificationAt: temporaryFailure
      ? args.now + retryDelayMs(failureCount)
      : args.now + JOB_ACTIVITY_POLICY.activeVerificationTtlMs,
    verificationFailureCount: failureCount,
    verificationLeaseUntil: undefined,
    lastVerifiedAt: temporaryFailure
      ? existingSource?.lastVerifiedAt
      : args.verification.verifiedAt,
    activityStatus: temporaryFailure
      ? existingSource?.activeEvidenceType !== undefined
        ? existingSource.activityStatus
        : "unknown"
      : args.verification.activityStatus,
    verificationMethod: args.verification.verificationMethod,
    verificationEvidence: args.verification.verificationEvidence,
    activeEvidenceType: temporaryFailure
      ? existingSource?.activeEvidenceType
      : (args.verification.activeEvidenceType ?? undefined),
    identityMatched: temporaryFailure
      ? existingSource?.identityMatched
      : args.verification.identityMatched,
    applicationAvailable: temporaryFailure
      ? existingSource?.applicationAvailable
      : args.verification.applicationAvailable,
    structuredDatePosted: temporaryFailure
      ? existingSource?.structuredDatePosted
      : (args.verification.structuredDatePosted ?? undefined),
    structuredValidThrough: temporaryFailure
      ? existingSource?.structuredValidThrough
      : (args.verification.structuredValidThrough ?? undefined),
    structuredJobIdentifier: temporaryFailure
      ? existingSource?.structuredJobIdentifier
      : (args.verification.structuredJobIdentifier ?? undefined),
    pageTitle: temporaryFailure
      ? existingSource?.pageTitle
      : (args.verification.pageTitle ?? undefined),
    redirected: temporaryFailure
      ? existingSource?.redirected
      : args.verification.redirected,
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

async function upsertDiscoveredSource(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    sourceUrl: string;
    sourceName: string | null;
    declaredType?: "employer" | "ats" | "job_board" | "other";
    now: number;
  },
) {
  const normalizedUrl = normalizePublicUrl(args.sourceUrl);
  if (!normalizedUrl) return null;
  const existing = await ctx.db
    .query("jobSources")
    .withIndex("by_normalizedUrl", (q) => q.eq("normalizedUrl", normalizedUrl))
    .first();
  if (existing) {
    if (existing.jobId !== args.jobId) return null;
    await ctx.db.patch("jobSources", existing._id, {
      sourceUrl: args.sourceUrl,
      lastSeenAt: args.now,
      // Rediscovery makes an inconclusive or closed source worth checking
      // again, without treating the sighting itself as active evidence.
      ...(!isFreshActiveSource(existing, args.now)
        ? { nextVerificationAt: args.now }
        : {}),
    });
    return existing._id;
  }
  const domain = new URL(normalizedUrl).hostname.toLocaleLowerCase("en-US");
  return await ctx.db.insert("jobSources", {
    jobId: args.jobId,
    sourceName: args.sourceName,
    sourceUrl: args.sourceUrl,
    normalizedUrl,
    domain,
    sourceTier: inferredSourceTier(normalizedUrl, args.declaredType),
    firstSeenAt: args.now,
    lastSeenAt: args.now,
    nextVerificationAt: args.now,
    verificationFailureCount: 0,
    activityStatus: "pending_verification",
    verificationEvidence: "provider_recently_seen_unverified",
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
  const activeSources = allSources.filter((source) =>
    isFreshActiveSource(source, now),
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
    activityReason: activityReasonForLifecycle({
      lifecycle,
      sources: allSources,
      bestSource: best,
    }),
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
              : verification.activityStatus === "inactive"
                ? "inactive"
                : "unknown",
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
      const observedSourceUrls = new Set([job.normalizedSourceUrl]);
      for (const evidence of job.sourceEvidence) {
        if (observedSourceUrls.has(evidence.url)) continue;
        observedSourceUrls.add(evidence.url);
        const additionalSourceId = await upsertDiscoveredSource(ctx, {
          jobId,
          sourceUrl: evidence.url,
          sourceName: null,
          now,
        });
        if (!additionalSourceId) continue;
        await ctx.db.insert("jobIngestionEvents", {
          jobId,
          sourceId: additionalSourceId,
          sourceUrl: evidence.url,
          contentHash: job.contentHash,
          rawProviderJson: job.rawProviderJson,
          mergeReason: canonical.reason ?? undefined,
          observedAt: now,
        });
      }
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
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileJobUsers, {
        jobId,
        cursor: null,
      });
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
      plan: resolveJobSearchPlan(entitlement, Date.now()),
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
    if (args.plan === "pro") {
      await ctx.scheduler.runAfter(0, internal.dailyDiscovery.enqueueUser, {
        userId,
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
    !isUserFacingJobSource(source) ||
    !isFreshActiveSource(source) ||
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
    locationNames: job.geo ? locationNamesForGeography(job.geo) : undefined,
    workArrangement: job.workArrangement,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    discoveredAt: job.firstDiscoveredAt,
    lastVerifiedAt: source.lastVerifiedAt,
    relevanceScore: quality.relevanceScore,
    scoreComponents: quality.scoreComponents,
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

function deepReviewView(
  review: Doc<"jobDeepReviews"> | undefined,
  job: Doc<"jobs">,
  profileRevision: number,
) {
  if (!review) return undefined;
  return {
    status: review.status,
    language: review.language,
    stale:
      review.profileRevision !== profileRevision ||
      review.jobContentHash !== job.contentHash,
    matchPercentage: review.matchPercentage,
    verdict: review.verdict,
    summary: review.summary,
    strengths: review.strengths,
    gaps: review.gaps,
    resumeId: review.resumeId,
    resumeName: review.resumeName,
    resumeRationale: review.resumeRationale,
    resumeChanges: review.resumeChanges,
    companyWebsiteUrl: review.companyWebsiteUrl,
    directApplicationUrl: review.directApplicationUrl,
    applicationNote: review.applicationNote,
    interviewFocus: review.interviewFocus,
    updatedAt: review.updatedAt,
    errorCode: review.errorCode,
  };
}

export const listCurrentUserJobs = query({
  args: {
    view: v.optional(
      v.union(v.literal("suggestions"), v.literal("inProgress")),
    ),
  },
  returns: v.object({ jobs: v.array(jobFeedItem), plan: planValidator }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const [plan, reviews, profileRecord] = await Promise.all([
      currentPlan(ctx, userId, now),
      ctx.db
        .query("jobDeepReviews")
        .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100),
      getProfile(ctx, userId),
    ]);
    const reviewsByJob = new Map(
      reviews.map((review) => [review.jobId, review]),
    );
    if (args.view === "inProgress") {
      const applications = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_appliedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100);
      const jobs = await Promise.all(
        applications.map(async (application) => {
          const current = await ctx.db.get("jobs", application.jobId);
          const currentSource = current?.bestSourceId
            ? await ctx.db.get("jobSources", current.bestSourceId)
            : null;
          if (
            current &&
            (isDevelopmentFixtureJob(current) ||
              (currentSource && !isUserFacingJobSource(currentSource)))
          ) {
            return null;
          }
          const review = current
            ? deepReviewView(
                reviewsByJob.get(application.jobId),
                current,
                profileRecord?.updatedAt ?? 0,
              )
            : application.snapshot.deepReview;
          return {
            ...application.snapshot,
            appliedAt: application.appliedAt,
            unavailable: !current || !isDisplayEligibleJob(current),
            deepReview: review,
          };
        }),
      );
      return { jobs: jobs.filter((job) => job !== null), plan };
    }
    let profile: SearchProfile;
    try {
      profile = await loadSearchProfile(ctx, userId);
    } catch {
      return { jobs: [], plan };
    }
    if (!profileRecord) return { jobs: [], plan };
    const matches = await ctx.db
      .query("jobMatches")
      .withIndex(
        "by_userId_profileRevision_displayEligible_relevanceScore",
        (q) =>
          q
            .eq("userId", userId)
            .eq("profileRevision", profileRecord.updatedAt)
            .eq("displayEligible", true),
      )
      .order("desc")
      .take(50);
    const jobs = [];
    for (const match of matches) {
      const job = await ctx.db.get("jobs", match.jobId);
      if (!job) continue;
      const item = await feedItem(ctx, job, profile);
      if (!item) continue;
      jobs.push({
        ...item,
        deepReview: deepReviewView(
          reviewsByJob.get(job._id),
          job,
          profileRecord.updatedAt,
        ),
      });
    }
    jobs.sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        jobFreshness(b) - jobFreshness(a) ||
        feedSourcePriority(b.sourceTier) - feedSourcePriority(a.sourceTier),
    );
    return { jobs, plan };
  },
});

async function buildMatchAudit(ctx: QueryCtx, userId: Id<"users">) {
  const profile = await loadSearchProfile(ctx, userId);
  const profileRecord = await getProfile(ctx, userId);
  if (!profileRecord) profileIncomplete();
  const [allJobs, allSources, applications, materializedMatches] =
    await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
        .order("desc")
        .take(500),
      ctx.db.query("jobSources").withIndex("by_nextVerificationAt").take(1000),
      ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_appliedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(100),
      ctx.db
        .query("jobMatches")
        .withIndex(
          "by_userId_profileRevision_displayEligible_relevanceScore",
          (q) =>
            q
              .eq("userId", userId)
              .eq("profileRevision", profileRecord.updatedAt)
              .eq("displayEligible", true),
        )
        .order("desc")
        .take(50),
    ]);
  const appliedJobIds = new Set(applications.map((item) => item.jobId));
  const fixtureJobIds = new Set(
    allSources
      .filter((source) => !isUserFacingJobSource(source))
      .map((source) => source.jobId),
  );
  const canonicalJobs = allJobs.filter(
    (job) =>
      !job.canonicalJobId &&
      !isDevelopmentFixtureJob(job) &&
      !fixtureJobIds.has(job._id),
  );
  const realSources = allSources.filter(isUserFacingJobSource);
  const sourceById = new Map(realSources.map((source) => [source._id, source]));
  const realSourceJobIds = new Set(realSources.map((source) => source.jobId));
  const evaluated = canonicalJobs.map((job) => {
    const quality = evaluateJobQuality(job, profile);
    const source = job.bestSourceId ? sourceById.get(job.bestSourceId) : null;
    const activityEligible = Boolean(
      isDisplayEligibleJob(job) &&
      source &&
      isFreshActiveSource(source) &&
      source.finalUrl &&
      source.lastVerifiedAt,
    );
    return {
      job,
      source,
      quality,
      activityEligible,
      accepted: activityEligible && quality.outcome === "eligible",
    };
  });
  const activityEligible = evaluated.filter((item) => item.activityEligible);
  activityEligible.sort(
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
  const rejectionCounts = new Map<string, number>();
  const reject = (reason: string) =>
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
  for (const item of evaluated) {
    if (!item.activityEligible) {
      const reason =
        item.job.lifecycleStatus === "closed"
          ? "activity_closed"
          : item.job.lifecycleStatus === "expired"
            ? "activity_expired"
            : "activity_unknown";
      reject(reason);
      continue;
    }
    for (const reason of item.quality.exclusionReasons) {
      reject(reason === "location_conflict" ? "outside_radius" : reason);
    }
  }
  const acceptedJobIds = new Set(
    activityEligible
      .filter((item) => item.accepted && !appliedJobIds.has(item.job._id))
      .map((item) => item.job._id),
  );
  const insideLocation = activityEligible.filter(
    (item) => !item.quality.exclusionReasons.includes("location_conflict"),
  );
  const professionalEligible = insideLocation.filter(
    (item) => item.quality.hardEligibilityPassed,
  );
  return {
    profile,
    counts: {
      canonicalRealJobs: canonicalJobs.length,
      realSourceJobs: canonicalJobs.filter((job) =>
        realSourceJobIds.has(job._id),
      ).length,
      activityEligible: activityEligible.length,
      afterDedupe: activityEligible.length,
      insideLocation: insideLocation.length,
      professionalEligible: professionalEligible.length,
      scoredForRelevance: professionalEligible.length,
      aboveThreshold: professionalEligible.filter(
        (item) => item.quality.passesRelevanceThreshold,
      ).length,
      displayed: materializedMatches.filter((match) =>
        acceptedJobIds.has(match.jobId),
      ).length,
    },
    rejectionReasons: [...rejectionCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
    candidates: activityEligible.slice(0, 10).map((item, index) => ({
      rank: index + 1,
      jobId: item.job._id,
      title: item.job.title,
      companyName: item.job.companyName,
      relevanceScore: item.quality.relevanceScore,
      scoreComponents: item.quality.scoreComponents,
      exclusionReasons: item.quality.exclusionReasons,
      matchReasons: item.quality.matchReasons,
      sourceTier: item.source?.sourceTier ?? null,
      decision: item.accepted
        ? item.quality.relevanceScore >= 78
          ? ("strong" as const)
          : ("acceptable" as const)
        : ("reject" as const),
    })),
  };
}

export const getCurrentUserMatchAudit = query({
  args: {},
  returns: matchAuditValidator,
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (env.DEV_TOOLS_ENABLED !== "true")
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    return await buildMatchAudit(ctx, userId);
  },
});

export const getUserMatchAuditForDevelopment = internalQuery({
  args: { userId: v.id("users") },
  returns: matchAuditValidator,
  handler: async (ctx, args) => {
    return await buildMatchAudit(ctx, args.userId);
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
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserJob, {
        userId,
        jobId: args.jobId,
      });
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
    const match = await ctx.db
      .query("jobMatches")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", args.jobId),
      )
      .unique();
    if (match)
      await ctx.db.patch("jobMatches", match._id, { displayEligible: false });
    return null;
  },
});

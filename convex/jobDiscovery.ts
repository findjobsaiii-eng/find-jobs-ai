import {
  applicationStatus,
  applicationTimelineEvent,
  jobFeedItem,
  jobSearchProviderDiagnostics,
} from "./schema";
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
import {
  buildSearchPlan,
  normalizedKey,
  normalizePublicUrl,
} from "./jobDiscoveryModel";
import { locationNamesForGeography } from "./jobGeography";
import { classifyJobSource, preferredSourceSortKey } from "./jobSourceQuality";
import {
  evaluateSuggestionFreshness,
  freshnessSortValue,
  normalizeDiscoveredPostingDate,
  selectOriginalPostingDate,
} from "./jobFreshness";
import { rememberVerifiedCompanySource } from "./companySourceMemory";
import { DISCOVERY_SOURCE_FAMILIES } from "./jobSourceQuality";
import { sourceYieldGroup } from "./jobSourceQuality";
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
  applicationUrl: v.optional(v.union(v.string(), v.null())),
  structuredDatePosted: v.union(v.string(), v.null()),
  datePosted: v.optional(v.union(v.string(), v.null())),
  datePostedProvenance: v.optional(
    v.union(
      v.literal("employer_ats_structured"),
      v.literal("jobposting_jsonld"),
      v.literal("provider_structured"),
      v.literal("page_explicit"),
      v.literal("discovery_metadata"),
      v.null(),
    ),
  ),
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
    freshnessEligible: v.number(),
    stalePostingExcluded: v.number(),
    afterDedupe: v.number(),
    insideLocation: v.number(),
    outsideRadiusRelevant: v.number(),
    professionalEligible: v.number(),
    scoredForRelevance: v.number(),
    aboveThreshold: v.number(),
    strongMatches: v.number(),
    partialMatches: v.number(),
    lowConfidenceEligible: v.number(),
    historyExclusions: v.number(),
    finalExcluded: v.number(),
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
      matchQuality: v.union(
        v.literal("strong"),
        v.literal("partial"),
        v.literal("possible"),
      ),
      scoreComponents: auditScoreComponentsValidator,
      exclusionReasons: v.array(v.string()),
      finalExclusionReasons: v.array(v.string()),
      matchReasons: v.array(v.string()),
      sourceTier: v.union(
        v.literal("employer"),
        v.literal("ats"),
        v.literal("job_board"),
        v.literal("aggregator"),
        v.null(),
      ),
      sourceFamily: v.union(v.string(), v.null()),
      preferredSource: v.union(v.string(), v.null()),
      datePosted: v.union(v.string(), v.null()),
      datePostedProvenance: v.union(v.string(), v.null()),
      ageDays: v.union(v.number(), v.null()),
      freshnessBucket: v.string(),
      firstSeenAt: v.number(),
      lastSeenAt: v.number(),
      lastVerifiedAt: v.union(v.number(), v.null()),
      activityState: v.string(),
      locationEligible: v.boolean(),
      professionalEligible: v.boolean(),
      freshnessEligible: v.boolean(),
      suggestionsEligible: v.boolean(),
      decision: v.union(
        v.literal("strong"),
        v.literal("partial"),
        v.literal("possible"),
        v.literal("reject"),
      ),
    }),
  ),
});
const sourceCoverageValidator = v.object({
  totals: v.object({
    employerOrAtsJobs: v.number(),
    majorJobBoardJobs: v.number(),
    secondaryOnlyJobs: v.number(),
    directApplicationJobs: v.number(),
  }),
  sources: v.array(
    v.object({
      family: v.string(),
      domain: v.string(),
      canonicalJobs: v.number(),
      active: v.number(),
      unknown: v.number(),
      closed: v.number(),
      expired: v.number(),
      suggestions: v.number(),
      directApplication: v.number(),
    }),
  ),
  recentSearches: v.array(
    v.object({
      query: v.string(),
      role: v.string(),
      searchedFamilies: v.array(v.string()),
      producedFamilies: v.array(
        v.object({ family: v.string(), count: v.number() }),
      ),
      uniqueCanonicalJobs: v.number(),
      providerCandidates: v.number(),
      newCanonicalJobs: v.number(),
      existingCanonicalJobs: v.number(),
      employerOrAts: v.number(),
      majorBoards: v.number(),
      aggregators: v.number(),
      sourceCounts: v.object({
        employerCareers: v.number(),
        ats: v.number(),
        linkedIn: v.number(),
        israeliBoards: v.number(),
        recruiting: v.number(),
        aggregators: v.number(),
        other: v.number(),
      }),
      verifiedActive: v.number(),
      unknown: v.number(),
      closed: v.number(),
      expired: v.number(),
      freshness: v.object({
        veryFresh: v.number(),
        fresh: v.number(),
        acceptable: v.number(),
        old: v.number(),
        stale: v.number(),
        unknown: v.number(),
      }),
      passedLocation: v.number(),
      professionallyEligible: v.number(),
      aboveThreshold: v.number(),
      stalePostingExclusions: v.number(),
      newSuggestions: v.number(),
      newDirectCanonicalJobs: v.number(),
      upgradedWithDirectSource: v.number(),
      directSourceRate: v.number(),
      directActiveYield: v.number(),
    }),
  ),
});
const feedEmptyStateValidator = v.union(
  v.null(),
  v.object({
    reason: v.union(
      v.literal("location"),
      v.literal("relevance"),
      v.literal("no_active_jobs"),
    ),
    radiusKm: v.number(),
    outsideRadiusCount: v.number(),
  }),
);
const discoveryStateValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
);

const MAX_APPLICATION_NOTE_LENGTH = 3_000;

type ApplicationStatus =
  | "saved"
  | "applied"
  | "recruiter_contact"
  | "phone_screen"
  | "interview"
  | "assignment"
  | "final_interview"
  | "offer"
  | "rejected"
  | "withdrawn";

function timelineEventView(event: Doc<"jobApplicationEvents">) {
  if (event.kind === "status_change") {
    return {
      id: event._id,
      kind: event.kind,
      status: event.status,
      note: event.note,
      createdAt: event.createdAt,
    };
  }
  if (event.kind === "status_removed") {
    return {
      id: event._id,
      kind: event.kind,
      previousStatus: event.previousStatus,
      createdAt: event.createdAt,
    };
  }
  return {
    id: event._id,
    kind: event.kind,
    note: event.note,
    createdAt: event.createdAt,
  };
}

function timelineEventsByApplication(events: Doc<"jobApplicationEvents">[]) {
  const byApplication = new Map<
    Id<"jobApplications">,
    ReturnType<typeof timelineEventView>[]
  >();
  for (const event of events) {
    const current = byApplication.get(event.applicationId) ?? [];
    if (current.length < 20) current.push(timelineEventView(event));
    byApplication.set(event.applicationId, current);
  }
  return byApplication;
}

function trackingFields(
  application: Doc<"jobApplications"> | undefined,
  events: ReturnType<typeof timelineEventView>[] = [],
) {
  if (!application) {
    return {
      appliedAt: undefined,
      trackingStatus: undefined,
      trackingUpdatedAt: undefined,
      trackingTimeline: undefined,
    };
  }
  return {
    appliedAt: application.appliedAt,
    trackingStatus: application.status,
    trackingUpdatedAt: application.updatedAt,
    trackingTimeline: events,
  };
}

function normalizedNote(note: string | undefined) {
  if (note === undefined) return undefined;
  const value = note.trim();
  if (value.length > MAX_APPLICATION_NOTE_LENGTH) {
    throw new ConvexError({ code: "APPLICATION_NOTES_TOO_LONG" });
  }
  return value || undefined;
}

async function addApplicationEvent(
  ctx: MutationCtx,
  application: Doc<"jobApplications">,
  event:
    | {
        kind: "status_change";
        status: ApplicationStatus;
        note?: string;
        createdAt: number;
      }
    | { kind: "note"; note: string; createdAt: number }
    | {
        kind: "status_removed";
        previousStatus: ApplicationStatus;
        createdAt: number;
      },
) {
  await ctx.db.insert("jobApplicationEvents", {
    userId: application.userId,
    applicationId: application._id,
    jobId: application.jobId,
    ...event,
  });
}

async function canonicalTrackingJob(
  ctx: QueryCtx | MutationCtx,
  jobId: Id<"jobs">,
) {
  const requested = await ctx.db.get("jobs", jobId);
  const canonicalId = requested?.canonicalJobId ?? jobId;
  return {
    jobId: canonicalId,
    job:
      canonicalId === jobId ? requested : await ctx.db.get("jobs", canonicalId),
  };
}

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

async function hasVisibleMatchesForCurrentProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const profile = await ctx.db
    .query("candidateProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile?.onboardingCompleted) return false;
  return Boolean(
    await ctx.db
      .query("jobMatches")
      .withIndex(
        "by_userId_profileRevision_displayEligible_relevanceScore",
        (q) =>
          q
            .eq("userId", userId)
            .eq("profileRevision", profile.updatedAt)
            .eq("displayEligible", true),
      )
      .first(),
  );
}

export const hasVisibleJobsForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: (ctx, args) => hasVisibleMatchesForCurrentProfile(ctx, args.userId),
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
    if (!args.manual && record.lastAttemptDay === dayKey) {
      const claimedRun = record.lastAttemptRunId
        ? await ctx.db.get("jobSearchRuns", record.lastAttemptRunId)
        : null;
      if (
        claimedRun?.status === "running" ||
        (await hasVisibleMatchesForCurrentProfile(ctx, args.userId))
      ) {
        return null;
      }
    }
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
  return preferredSourceSortKey(source);
}

function inferredSourceTier(
  normalizedUrl: string,
  declared?: "employer" | "ats" | "job_board" | "other",
): Doc<"jobSources">["sourceTier"] {
  const hostname = new URL(normalizedUrl).hostname.toLocaleLowerCase("en-US");
  return classifyJobSource(hostname, declared).sourceTier;
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
  // A provider-issued vacancy ID is stronger repost evidence than an
  // identical description. Employers commonly reuse the same copy when they
  // publish a genuinely new opening, so content equality must not collapse it
  // back into the old canonical vacancy.
  return !conflictingSameProvider;
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
    applicationUrl: temporaryFailure
      ? existingSource?.applicationUrl
      : (args.verification.applicationUrl ?? undefined),
    structuredDatePosted: temporaryFailure
      ? existingSource?.structuredDatePosted
      : (args.verification.structuredDatePosted ?? undefined),
    datePosted: temporaryFailure
      ? existingSource?.datePosted
      : (args.verification.datePosted ?? undefined),
    datePostedProvenance: temporaryFailure
      ? existingSource?.datePostedProvenance
      : (args.verification.datePostedProvenance ?? undefined),
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
  activeSources.sort((a, b) => {
    const left = sourcePriority(a);
    const right = sourcePriority(b);
    return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  });
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
  });
  return best ?? null;
}

export const reclassifySourcesForDevelopment = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    changed: v.number(),
    processed: v.number(),
    cursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    const page = await ctx.db.query("jobSources").paginate({
      cursor: args.cursor,
      numItems: Math.min(Math.max(args.limit ?? 100, 1), 200),
    });
    const affected = new Set<Id<"jobs">>();
    let changed = 0;
    for (const source of page.page) {
      const declared =
        source.sourceTier === "aggregator"
          ? "other"
          : source.sourceTier === "employer"
            ? "employer"
            : source.sourceTier;
      const next = classifyJobSource(source.domain, declared).sourceTier;
      if (next === source.sourceTier) continue;
      await ctx.db.patch("jobSources", source._id, { sourceTier: next });
      affected.add(source.jobId);
      changed += 1;
    }
    for (const jobId of affected)
      await refreshBestSource(ctx, jobId, Date.now());
    return {
      changed,
      processed: page.page.length,
      cursor: page.isDone ? null : page.continueCursor,
      done: page.isDone,
    };
  },
});

export const completeSearch = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    runId: v.id("jobSearchRuns"),
    reservationId: v.string(),
    returnedCandidateCount: v.number(),
    rejectedCount: v.number(),
    webSearchToolCallCount: v.number(),
    usage: usageValidator,
    providerDiagnostics: v.optional(jobSearchProviderDiagnostics),
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
      const discoveredPostedAt = normalizeDiscoveredPostingDate(
        job.postedAt,
        now,
      );
      const providerPosting = {
        postedAt: discoveredPostedAt,
        datePostedProvenance: discoveredPostedAt
          ? ("discovery_metadata" as const)
          : undefined,
      };
      const verifiedPosting = {
        postedAt: verification.datePosted,
        datePostedProvenance: verification.datePostedProvenance ?? undefined,
      };
      const incomingPosting = selectOriginalPostingDate(
        providerPosting,
        verifiedPosting,
      );
      const selectedPosting = centralJob
        ? selectOriginalPostingDate(centralJob, incomingPosting)
        : incomingPosting;
      const storedJob = {
        ...job,
        postedAt: selectedPosting.postedAt ?? null,
        datePostedProvenance: selectedPosting.datePostedProvenance,
      };
      let jobId: Id<"jobs">;
      if (centralJob) {
        jobId = centralJob._id;
        deduplicatedCount += 1;
        if (centralJob.contentHash !== job.contentHash) {
          await ctx.db.patch("jobs", jobId, {
            ...storedJob,
            firstDiscoveredAt: centralJob.firstDiscoveredAt,
            lastDiscoveredAt: now,
            lifecycleStatus: centralJob.lifecycleStatus,
            activityStatus: centralJob.activityStatus,
            bestSourceId: centralJob.bestSourceId,
          });
        } else if (
          centralJob.postedAt !== storedJob.postedAt ||
          centralJob.datePostedProvenance !== storedJob.datePostedProvenance
        ) {
          await ctx.db.patch("jobs", jobId, {
            postedAt: storedJob.postedAt,
            datePostedProvenance: storedJob.datePostedProvenance,
            lastDiscoveredAt: now,
          });
        }
      } else {
        jobId = await ctx.db.insert("jobs", {
          ...storedJob,
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
      const storedSource = await ctx.db.get("jobSources", sourceId);
      const storedCanonical = await ctx.db.get("jobs", jobId);
      if (storedSource && storedCanonical) {
        await rememberVerifiedCompanySource(ctx, {
          job: storedCanonical,
          source: storedSource,
        });
      }
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
      const freshness = evaluateSuggestionFreshness({
        postedAt: centralJob.postedAt,
        lifecycleStatus: centralJob.lifecycleStatus,
        relevanceScore: quality.relevanceScore,
        now,
      });
      if (
        !bestSource &&
        !quality.exclusionReasons.includes("not_verified_active")
      ) {
        quality.outcome = "excluded";
        quality.exclusionReasons.unshift("not_verified_active");
      }
      const alreadySeen = seenJobs.has(jobId);
      if (!alreadySeen) {
        if (quality.outcome === "eligible" && freshness.eligible)
          eligibleCount += 1;
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
      providerDiagnostics: args.providerDiagnostics,
    });
    if (eligibleCount > 0) {
      await ctx.db.patch("jobSearchQueries", run.queryId, {
        lastSuccessfulRunAt: now,
      });
    }
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
    providerDiagnostics: v.optional(jobSearchProviderDiagnostics),
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
      providerDiagnostics: args.providerDiagnostics,
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
  const freshness = evaluateSuggestionFreshness({
    postedAt: job.postedAt,
    lifecycleStatus: job.lifecycleStatus,
    relevanceScore: quality.relevanceScore,
  });
  if (
    !isDisplayEligibleJob(job) ||
    quality.outcome !== "eligible" ||
    !freshness.eligible ||
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
    datePostedProvenance: job.datePostedProvenance,
    postedAgeDays: freshness.ageDays,
    freshnessBucket: freshness.bucket,
    unavailable: false,
    sourceUrl: source.applicationUrl ?? source.finalUrl,
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
    matchQuality: quality.matchQuality,
    scoreComponents: quality.scoreComponents,
    matchReasons: quality.matchReasons,
    matchHighlights: quality.matchDetails,
    resultSource: "central" as const,
  };
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

async function suggestionFeedForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
  profile: SearchProfile,
  profileRevision: number,
  reviewsByJob: Map<Id<"jobs">, Doc<"jobDeepReviews">>,
  applicationsByJob: Map<Id<"jobs">, Doc<"jobApplications">>,
  eventsByApplication: Map<
    Id<"jobApplications">,
    ReturnType<typeof timelineEventView>[]
  >,
) {
  const matches = await ctx.db
    .query("jobMatches")
    .withIndex(
      "by_userId_profileRevision_displayEligible_relevanceScore",
      (q) =>
        q
          .eq("userId", userId)
          .eq("profileRevision", profileRevision)
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
    const application = applicationsByJob.get(job._id);
    jobs.push({
      ...item,
      ...trackingFields(
        application,
        application ? eventsByApplication.get(application._id) : undefined,
      ),
      deepReview: deepReviewView(
        reviewsByJob.get(job._id),
        job,
        profileRevision,
      ),
    });
  }
  jobs.sort(
    (a, b) =>
      b.relevanceScore - a.relevanceScore ||
      freshnessSortValue(b.postedAt) - freshnessSortValue(a.postedAt) ||
      feedSourcePriority(b.sourceTier) - feedSourcePriority(a.sourceTier),
  );
  return jobs;
}

export const listCurrentUserJobs = query({
  args: {
    view: v.optional(
      v.union(v.literal("suggestions"), v.literal("inProgress")),
    ),
  },
  returns: v.object({
    jobs: v.array(jobFeedItem),
    plan: planValidator,
    emptyState: feedEmptyStateValidator,
    discoveryState: v.union(v.null(), discoveryStateValidator),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const [plan, reviews, profileRecord, applications, applicationEvents] =
      await Promise.all([
        currentPlan(ctx, userId, now),
        ctx.db
          .query("jobDeepReviews")
          .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
          .order("desc")
          .take(100),
        getProfile(ctx, userId),
        ctx.db
          .query("jobApplications")
          .withIndex("by_userId_and_appliedAt", (q) => q.eq("userId", userId))
          .order("desc")
          .take(100),
        ctx.db
          .query("jobApplicationEvents")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
          .order("desc")
          .take(2_000),
      ]);
    const eventsByApplication = timelineEventsByApplication(applicationEvents);
    const reviewsByJob = new Map(
      reviews.map((review) => [review.jobId, review]),
    );
    if (args.view === "inProgress") {
      const jobs = await Promise.all(
        applications
          .filter((application) => application.status)
          .map(async (application) => {
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
              ...trackingFields(
                application,
                eventsByApplication.get(application._id),
              ),
              unavailable: !current || !isDisplayEligibleJob(current),
              deepReview: review,
            };
          }),
      );
      const visibleJobs = jobs.filter((job) => job !== null);
      visibleJobs.sort(
        (left, right) =>
          (right.trackingUpdatedAt ?? right.appliedAt ?? 0) -
          (left.trackingUpdatedAt ?? left.appliedAt ?? 0),
      );
      return {
        jobs: visibleJobs,
        plan,
        emptyState: null,
        discoveryState: null,
      };
    }
    let profile: SearchProfile;
    try {
      profile = await loadSearchProfile(ctx, userId);
    } catch {
      return { jobs: [], plan, emptyState: null, discoveryState: null };
    }
    if (!profileRecord)
      return { jobs: [], plan, emptyState: null, discoveryState: null };
    const [attempt, recentRuns] = await Promise.all([
      ctx.db
        .query("dailyDiscoveryAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("jobSearchRuns")
        .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(20),
    ]);
    const discoveryState = currentDiscoveryState(attempt, recentRuns, now);
    const jobs = await suggestionFeedForUser(
      ctx,
      userId,
      profile,
      profileRecord.updatedAt,
      reviewsByJob,
      new Map(
        applications.map((application) => [application.jobId, application]),
      ),
      eventsByApplication,
    );
    const emptyState = jobs.length
      ? null
      : emptyStateFromAudit(await buildMatchAudit(ctx, userId));
    return { jobs, plan, emptyState, discoveryState };
  },
});

function currentDiscoveryState(
  attempt: Doc<"dailyDiscoveryAttempts"> | null,
  recentRuns: Doc<"jobSearchRuns">[],
  now: number,
) {
  const dayKey = globalDayKey(now);
  const todaysAttempt = attempt?.dayKey === dayKey ? attempt : null;
  const todaysRuns = recentRuns.filter(
    (run) => globalDayKey(run.startedAt) === dayKey,
  );
  if (
    todaysAttempt?.lastOutcome === "queued" ||
    todaysAttempt?.nextAttemptAt !== undefined ||
    todaysRuns.some((run) => run.status === "running")
  ) {
    return "running" as const;
  }
  if (
    todaysAttempt?.lastOutcome === "completed" ||
    todaysRuns.some(
      (run) => run.status === "completed" || run.status === "reused",
    )
  ) {
    return "complete" as const;
  }
  if (todaysRuns.some((run) => run.status === "failed")) {
    return "failed" as const;
  }
  return "pending" as const;
}

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
  const appliedJobIds = new Set(
    applications
      .filter((item) => item.status && item.status !== "saved")
      .map((item) => item.jobId),
  );
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
    const freshness = evaluateSuggestionFreshness({
      postedAt: job.postedAt,
      lifecycleStatus: job.lifecycleStatus,
      relevanceScore: quality.relevanceScore,
    });
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
      freshness,
      activityEligible,
      accepted:
        activityEligible &&
        freshness.eligible &&
        quality.outcome === "eligible",
    };
  });
  const activityEligible = evaluated.filter((item) => item.activityEligible);
  const freshnessEligible = activityEligible.filter(
    (item) => item.freshness.eligible,
  );
  activityEligible.sort(
    (a, b) =>
      b.quality.relevanceScore - a.quality.relevanceScore ||
      freshnessSortValue(b.job.postedAt) - freshnessSortValue(a.job.postedAt) ||
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
    if (item.freshness.reason) reject(item.freshness.reason);
    for (const reason of item.quality.exclusionReasons) {
      reject(reason === "location_conflict" ? "outside_radius" : reason);
    }
    if (item.accepted && appliedJobIds.has(item.job._id)) {
      reject("already_applied");
    }
  }
  const acceptedJobIds = new Set(
    activityEligible
      .filter((item) => item.accepted && !appliedJobIds.has(item.job._id))
      .map((item) => item.job._id),
  );
  const insideLocation = activityEligible.filter(
    (item) =>
      item.freshness.eligible &&
      !item.quality.exclusionReasons.includes("location_conflict"),
  );
  const outsideRadiusRelevant = activityEligible.filter((item) => {
    if (!item.freshness.eligible) return false;
    if (!item.quality.exclusionReasons.includes("location_conflict")) {
      return false;
    }
    const otherBlockingReasons = item.quality.exclusionReasons.filter(
      (reason) => reason !== "location_conflict",
    );
    return otherBlockingReasons.length === 0;
  });
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
      freshnessEligible: freshnessEligible.length,
      stalePostingExcluded: activityEligible.filter(
        (item) => item.freshness.reason === "stale_posting",
      ).length,
      afterDedupe: activityEligible.length,
      insideLocation: insideLocation.length,
      outsideRadiusRelevant: outsideRadiusRelevant.length,
      professionalEligible: professionalEligible.length,
      scoredForRelevance: professionalEligible.length,
      aboveThreshold: professionalEligible.filter(
        (item) => item.quality.passesRelevanceThreshold,
      ).length,
      strongMatches: professionalEligible.filter(
        (item) => item.quality.matchQuality === "strong",
      ).length,
      partialMatches: professionalEligible.filter(
        (item) => item.quality.matchQuality === "partial",
      ).length,
      lowConfidenceEligible: professionalEligible.filter(
        (item) => item.quality.matchQuality === "possible",
      ).length,
      historyExclusions: freshnessEligible.filter(
        (item) => item.accepted && appliedJobIds.has(item.job._id),
      ).length,
      finalExcluded: freshnessEligible.filter(
        (item) => item.accepted && appliedJobIds.has(item.job._id),
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
      matchQuality: item.quality.matchQuality,
      scoreComponents: item.quality.scoreComponents,
      exclusionReasons: item.quality.exclusionReasons,
      finalExclusionReasons: [
        ...(item.freshness.reason ? [item.freshness.reason] : []),
        ...(item.accepted && appliedJobIds.has(item.job._id)
          ? ["already_applied"]
          : []),
      ],
      matchReasons: item.quality.matchReasons,
      sourceTier: item.source?.sourceTier ?? null,
      sourceFamily: item.source
        ? classifyJobSource(item.source.domain).sourceFamily
        : null,
      preferredSource: item.source?.finalUrl ?? null,
      datePosted: item.job.postedAt,
      datePostedProvenance: item.job.datePostedProvenance ?? null,
      ageDays: item.freshness.ageDays,
      freshnessBucket: item.freshness.bucket,
      firstSeenAt: item.job.firstDiscoveredAt,
      lastSeenAt: item.source?.lastSeenAt ?? item.job.lastDiscoveredAt,
      lastVerifiedAt: item.source?.lastVerifiedAt ?? null,
      activityState: item.job.lifecycleStatus ?? "unknown",
      locationEligible:
        !item.quality.exclusionReasons.includes("location_conflict"),
      professionalEligible: item.quality.exclusionReasons.every(
        (reason) => reason === "location_conflict",
      ),
      freshnessEligible: item.freshness.eligible,
      suggestionsEligible: item.accepted && !appliedJobIds.has(item.job._id),
      decision: item.accepted ? item.quality.matchQuality : ("reject" as const),
    })),
  };
}

function emptyStateFromAudit(
  audit: Awaited<ReturnType<typeof buildMatchAudit>>,
) {
  const outsideRadiusCount =
    audit.rejectionReasons.find(({ reason }) => reason === "outside_radius")
      ?.count ?? 0;
  return {
    reason:
      audit.counts.activityEligible === 0
        ? ("no_active_jobs" as const)
        : audit.counts.outsideRadiusRelevant > 0
          ? ("location" as const)
          : ("relevance" as const),
    radiusKm: audit.profile.location.radiusKm,
    outsideRadiusCount,
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

async function buildSourceCoverage(ctx: QueryCtx, userId: Id<"users">) {
  const [profileRecord, profile] = await Promise.all([
    getProfile(ctx, userId),
    loadSearchProfile(ctx, userId),
  ]);
  const [jobs, sources, matches, recentRuns] = await Promise.all([
    ctx.db.query("jobs").take(500),
    ctx.db.query("jobSources").take(1000),
    profileRecord
      ? ctx.db
          .query("jobMatches")
          .withIndex(
            "by_userId_profileRevision_displayEligible_relevanceScore",
            (q) =>
              q
                .eq("userId", userId)
                .eq("profileRevision", profileRecord.updatedAt)
                .eq("displayEligible", true),
          )
          .take(100)
      : Promise.resolve([]),
    ctx.db
      .query("jobSearchRuns")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10),
  ]);
  const sourceJobIds = new Set(
    sources.filter(isUserFacingJobSource).map((source) => source.jobId),
  );
  const fixtureJobIds = new Set(
    sources
      .filter((source) => !isUserFacingJobSource(source))
      .map((source) => source.jobId),
  );
  const canonicalJobs = jobs.filter(
    (job) =>
      !job.canonicalJobId &&
      sourceJobIds.has(job._id) &&
      !fixtureJobIds.has(job._id) &&
      !isDevelopmentFixtureJob(job),
  );
  const canonicalById = new Map(canonicalJobs.map((job) => [job._id, job]));
  const suggestionIds = new Set(matches.map((match) => match.jobId));
  const sourceById = new Map(sources.map((source) => [source._id, source]));
  const byJob = new Map<Id<"jobs">, Doc<"jobSources">[]>();
  for (const source of sources.filter(isUserFacingJobSource)) {
    if (!canonicalById.has(source.jobId)) continue;
    const values = byJob.get(source.jobId) ?? [];
    values.push(source);
    byJob.set(source.jobId, values);
  }
  const grouped = new Map<
    string,
    {
      family: string;
      domain: string;
      jobIds: Set<Id<"jobs">>;
      active: Set<Id<"jobs">>;
      unknown: Set<Id<"jobs">>;
      closed: Set<Id<"jobs">>;
      expired: Set<Id<"jobs">>;
      suggestions: Set<Id<"jobs">>;
      directApplication: Set<Id<"jobs">>;
    }
  >();
  for (const source of sources.filter(isUserFacingJobSource)) {
    const job = canonicalById.get(source.jobId);
    if (!job) continue;
    const classified = classifyJobSource(source.domain);
    const key = `${classified.sourceFamily}:${source.domain}`;
    const row = grouped.get(key) ?? {
      family: classified.sourceFamily,
      domain: source.domain,
      jobIds: new Set(),
      active: new Set(),
      unknown: new Set(),
      closed: new Set(),
      expired: new Set(),
      suggestions: new Set(),
      directApplication: new Set(),
    };
    row.jobIds.add(job._id);
    const lifecycle = job.lifecycleStatus ?? "unknown";
    if (lifecycle === "verified_active" || lifecycle === "probably_active") {
      row.active.add(job._id);
    } else if (lifecycle === "closed") row.closed.add(job._id);
    else if (lifecycle === "expired") row.expired.add(job._id);
    else row.unknown.add(job._id);
    if (suggestionIds.has(job._id)) row.suggestions.add(job._id);
    if (source.applicationAvailable) row.directApplication.add(job._id);
    grouped.set(key, row);
  }
  const sourceRows = [...grouped.values()]
    .map((row) => ({
      family: row.family,
      domain: row.domain,
      canonicalJobs: row.jobIds.size,
      active: row.active.size,
      unknown: row.unknown.size,
      closed: row.closed.size,
      expired: row.expired.size,
      suggestions: row.suggestions.size,
      directApplication: row.directApplication.size,
    }))
    .sort(
      (a, b) =>
        b.canonicalJobs - a.canonicalJobs || a.domain.localeCompare(b.domain),
    );

  const recentSearches = [];
  for (const run of recentRuns) {
    const queryRecord = await ctx.db.get("jobSearchQueries", run.queryId);
    const runDiscoveries = await ctx.db
      .query("jobDiscoveries")
      .withIndex("by_searchRunId", (q) => q.eq("searchRunId", run._id))
      .take(50);
    const produced = new Map<string, Set<Id<"jobs">>>();
    for (const discovery of runDiscoveries) {
      for (const source of byJob.get(discovery.jobId) ?? []) {
        const family = classifyJobSource(source.domain).sourceFamily;
        const ids = produced.get(family) ?? new Set<Id<"jobs">>();
        ids.add(discovery.jobId);
        produced.set(family, ids);
      }
    }
    const runJobs = [
      ...new Set(runDiscoveries.map((item) => item.jobId)),
    ].flatMap((jobId) => {
      const job = canonicalById.get(jobId);
      return job ? [job] : [];
    });
    const employerOrAts = new Set<Id<"jobs">>();
    const majorBoards = new Set<Id<"jobs">>();
    const aggregators = new Set<Id<"jobs">>();
    const sourceGroups = new Map<string, Set<Id<"jobs">>>();
    const runEndedAt = run.completedAt ?? Date.now();
    for (const job of runJobs) {
      const sourcesSeenThisRun = (byJob.get(job._id) ?? []).filter(
        (source) =>
          source.lastSeenAt >= run.startedAt && source.lastSeenAt <= runEndedAt,
      );
      for (const source of sourcesSeenThisRun) {
        const family = classifyJobSource(source.domain).sourceFamily;
        const group = sourceYieldGroup(source.domain, source.sourceTier);
        const groupJobs = sourceGroups.get(group) ?? new Set<Id<"jobs">>();
        groupJobs.add(job._id);
        sourceGroups.set(group, groupJobs);
        if (family === "employer_direct" || family === "ats_direct") {
          employerOrAts.add(job._id);
        } else if (family === "major_job_board") {
          majorBoards.add(job._id);
        } else if (family === "aggregator") aggregators.add(job._id);
      }
    }
    const parseRole = () => {
      try {
        const criteria = JSON.parse(
          queryRecord?.normalizedCriteria ?? "{}",
        ) as {
          role?: unknown;
        };
        return typeof criteria.role === "string" ? criteria.role : "unknown";
      } catch {
        return "unknown";
      }
    };
    const currentEligible = (job: Doc<"jobs">) => {
      const bestSource = job.bestSourceId
        ? sourceById.get(job.bestSourceId)
        : undefined;
      return Boolean(
        bestSource &&
        isUserFacingJobSource(bestSource) &&
        isDisplayEligibleJob(job) &&
        isFreshActiveSource(bestSource),
      );
    };
    const evaluatedRunJobs = runJobs.map((job) => {
      const quality = evaluateJobQuality(job, profile);
      const freshness = evaluateSuggestionFreshness({
        postedAt: job.postedAt,
        lifecycleStatus: job.lifecycleStatus,
        relevanceScore: quality.relevanceScore,
      });
      return {
        job,
        quality,
        freshness,
        activityEligible: currentEligible(job),
      };
    });
    const countGroup = (name: string) => sourceGroups.get(name)?.size ?? 0;
    const activeDirectNew = evaluatedRunJobs.filter(
      ({ job, activityEligible }) =>
        activityEligible &&
        job.firstDiscoveredAt >= run.startedAt &&
        employerOrAts.has(job._id),
    ).length;
    const newDirectCanonicalJobs = runJobs.filter(
      (job) =>
        job.firstDiscoveredAt >= run.startedAt && employerOrAts.has(job._id),
    ).length;
    const upgradedWithDirectSource = runJobs.filter(
      (job) =>
        job.firstDiscoveredAt < run.startedAt &&
        (byJob.get(job._id) ?? []).some(
          (source) =>
            (source.sourceTier === "employer" || source.sourceTier === "ats") &&
            source.firstSeenAt >= run.startedAt &&
            source.firstSeenAt <= runEndedAt,
        ),
    ).length;
    const pct = (value: number) =>
      run.returnedCandidateCount === 0
        ? 0
        : Math.round((value / run.returnedCandidateCount) * 1_000) / 10;
    recentSearches.push({
      query: queryRecord?.generatedQueries[0] ?? "",
      role: parseRole(),
      searchedFamilies: [...DISCOVERY_SOURCE_FAMILIES],
      producedFamilies: [...produced.entries()].map(([family, ids]) => ({
        family,
        count: ids.size,
      })),
      uniqueCanonicalJobs: new Set(runDiscoveries.map((item) => item.jobId))
        .size,
      providerCandidates: run.returnedCandidateCount,
      newCanonicalJobs: run.insertedCount,
      existingCanonicalJobs: run.deduplicatedCount,
      employerOrAts: employerOrAts.size,
      majorBoards: majorBoards.size,
      aggregators: aggregators.size,
      sourceCounts: {
        employerCareers: countGroup("Employer careers"),
        ats: countGroup("ATS"),
        linkedIn: countGroup("LinkedIn"),
        israeliBoards:
          countGroup("Drushim") +
          countGroup("JobMaster") +
          countGroup("AllJobs") +
          countGroup("Jobify") +
          countGroup("Indeed"),
        recruiting: countGroup("Recruiting agencies"),
        aggregators: countGroup("Aggregators"),
        other: countGroup("Other secondary sources"),
      },
      verifiedActive: evaluatedRunJobs.filter(
        ({ activityEligible }) => activityEligible,
      ).length,
      unknown: runJobs.filter(
        (job) => (job.lifecycleStatus ?? "unknown") === "unknown",
      ).length,
      closed: runJobs.filter((job) => job.lifecycleStatus === "closed").length,
      expired: runJobs.filter((job) => job.lifecycleStatus === "expired")
        .length,
      freshness: {
        veryFresh: evaluatedRunJobs.filter(
          ({ freshness }) => freshness.bucket === "very_fresh",
        ).length,
        fresh: evaluatedRunJobs.filter(
          ({ freshness }) => freshness.bucket === "fresh",
        ).length,
        acceptable: evaluatedRunJobs.filter(
          ({ freshness }) => freshness.bucket === "acceptable",
        ).length,
        old: evaluatedRunJobs.filter(
          ({ freshness }) => freshness.bucket === "old",
        ).length,
        stale: evaluatedRunJobs.filter(
          ({ freshness }) => freshness.bucket === "stale_for_suggestions",
        ).length,
        unknown: evaluatedRunJobs.filter(
          ({ freshness }) => freshness.bucket === "freshness_unknown",
        ).length,
      },
      passedLocation: evaluatedRunJobs.filter(
        ({ activityEligible, freshness, quality }) =>
          activityEligible &&
          freshness.eligible &&
          !quality.exclusionReasons.includes("location_conflict"),
      ).length,
      professionallyEligible: evaluatedRunJobs.filter(
        ({ activityEligible, freshness, quality }) =>
          activityEligible &&
          freshness.eligible &&
          quality.exclusionReasons.every(
            (reason) => reason === "location_conflict",
          ),
      ).length,
      aboveThreshold: evaluatedRunJobs.filter(
        ({ activityEligible, freshness, quality }) =>
          activityEligible &&
          freshness.eligible &&
          quality.hardEligibilityPassed &&
          quality.passesRelevanceThreshold,
      ).length,
      stalePostingExclusions: evaluatedRunJobs.filter(
        ({ freshness }) => freshness.reason === "stale_posting",
      ).length,
      newSuggestions: runJobs.filter((job) => suggestionIds.has(job._id))
        .length,
      newDirectCanonicalJobs,
      upgradedWithDirectSource,
      directSourceRate: pct(employerOrAts.size),
      directActiveYield: pct(activeDirectNew),
    });
  }
  let employerOrAtsJobs = 0;
  let majorJobBoardJobs = 0;
  let secondaryOnlyJobs = 0;
  let directApplicationJobs = 0;
  for (const job of canonicalJobs) {
    const classifications = (byJob.get(job._id) ?? []).map((source) => ({
      ...classifyJobSource(source.domain),
      applicationAvailable: source.applicationAvailable === true,
    }));
    if (
      classifications.some(
        (item) =>
          item.sourceFamily === "employer_direct" ||
          item.sourceFamily === "ats_direct",
      )
    )
      employerOrAtsJobs += 1;
    if (classifications.some((item) => item.sourceFamily === "major_job_board"))
      majorJobBoardJobs += 1;
    if (
      classifications.length &&
      classifications.every(
        (item) =>
          item.sourceFamily === "aggregator" ||
          item.sourceFamily === "other_reputable",
      )
    )
      secondaryOnlyJobs += 1;
    if (classifications.some((item) => item.applicationAvailable))
      directApplicationJobs += 1;
  }
  return {
    totals: {
      employerOrAtsJobs,
      majorJobBoardJobs,
      secondaryOnlyJobs,
      directApplicationJobs,
    },
    sources: sourceRows,
    recentSearches,
  };
}

export const getCurrentUserSourceCoverage = query({
  args: {},
  returns: sourceCoverageValidator,
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    return await buildSourceCoverage(ctx, userId);
  },
});

export const getSourceCoverageForDevelopment = internalQuery({
  args: { userId: v.id("users") },
  returns: sourceCoverageValidator,
  handler: async (ctx, args) => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    return await buildSourceCoverage(ctx, args.userId);
  },
});

export const getSearchPlanForDevelopment = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.object({ role: v.string(), query: v.string() })),
  handler: async (ctx, args) => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    const profile = await loadSearchProfile(ctx, args.userId);
    return buildSearchPlan(profile).queryPlans.map((plan) => ({
      role: plan.role,
      query: plan.generatedQuery,
    }));
  },
});

export const getUserMatchAuditForDevelopment = internalQuery({
  args: { userId: v.id("users") },
  returns: matchAuditValidator,
  handler: async (ctx, args) => {
    return await buildMatchAudit(ctx, args.userId);
  },
});

export const listUserJobsForDevelopment = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(jobFeedItem),
  handler: async (ctx, args) => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    const [profile, profileRecord, reviews] = await Promise.all([
      loadSearchProfile(ctx, args.userId),
      getProfile(ctx, args.userId),
      ctx.db
        .query("jobDeepReviews")
        .withIndex("by_userId_and_updatedAt", (q) =>
          q.eq("userId", args.userId),
        )
        .order("desc")
        .take(100),
    ]);
    if (!profileRecord) profileIncomplete();
    return await suggestionFeedForUser(
      ctx,
      args.userId,
      profile,
      profileRecord.updatedAt,
      new Map(reviews.map((review) => [review.jobId, review])),
      new Map(),
      new Map(),
    );
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

export const listJobTrackingTimeline = query({
  args: { jobId: v.id("jobs") },
  returns: v.array(applicationTimelineEvent),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trackedJob = await canonicalTrackingJob(ctx, args.jobId);
    const application = await ctx.db
      .query("jobApplications")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", trackedJob.jobId),
      )
      .unique();
    if (!application) return [];
    const events = await ctx.db
      .query("jobApplicationEvents")
      .withIndex("by_applicationId_and_createdAt", (q) =>
        q.eq("applicationId", application._id),
      )
      .order("desc")
      .take(100);
    return events.map(timelineEventView);
  },
});

export const removeJobTracking = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trackedJob = await canonicalTrackingJob(ctx, args.jobId);
    const existing = await ctx.db
      .query("jobApplications")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", trackedJob.jobId),
      )
      .unique();
    if (existing) {
      if (!existing.status) return null;
      const now = Date.now();
      await ctx.db.patch("jobApplications", existing._id, {
        status: undefined,
        updatedAt: now,
      });
      await addApplicationEvent(ctx, existing, {
        kind: "status_removed",
        previousStatus: existing.status,
        createdAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserJob, {
      userId,
      jobId: trackedJob.jobId,
    });
    return null;
  },
});

export const updateJobTracking = mutation({
  args: {
    jobId: v.id("jobs"),
    status: applicationStatus,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trackedJob = await canonicalTrackingJob(ctx, args.jobId);
    const existing = await ctx.db
      .query("jobApplications")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", trackedJob.jobId),
      )
      .unique();
    const now = Date.now();
    const note = normalizedNote(args.note);
    if (existing) {
      if (existing.status === args.status) return null;
      await ctx.db.patch("jobApplications", existing._id, {
        status: args.status,
        ...(args.status !== "saved" && !existing.appliedAt
          ? { appliedAt: now }
          : {}),
        updatedAt: now,
      });
      await addApplicationEvent(ctx, existing, {
        kind: "status_change",
        status: args.status,
        note,
        createdAt: now,
      });
    } else {
      const job = trackedJob.job;
      const item = job
        ? await feedItem(ctx, job, await loadSearchProfile(ctx, userId))
        : null;
      if (!item) throw new ConvexError({ code: "JOB_NOT_AVAILABLE" });
      const applicationId = await ctx.db.insert("jobApplications", {
        userId,
        jobId: trackedJob.jobId,
        ...(args.status !== "saved" ? { appliedAt: now } : {}),
        status: args.status,
        updatedAt: now,
        snapshot: item,
      });
      const application = await ctx.db.get("jobApplications", applicationId);
      if (application) {
        await addApplicationEvent(ctx, application, {
          kind: "status_change",
          status: args.status,
          note,
          createdAt: now,
        });
      }
    }
    const match = await ctx.db
      .query("jobMatches")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", trackedJob.jobId),
      )
      .unique();
    if (args.status === "saved") {
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserJob, {
        userId,
        jobId: trackedJob.jobId,
      });
    } else if (match) {
      await ctx.db.patch("jobMatches", match._id, { displayEligible: false });
    }
    return null;
  },
});

export const addJobTrackingNote = mutation({
  args: { jobId: v.id("jobs"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trackedJob = await canonicalTrackingJob(ctx, args.jobId);
    const note = normalizedNote(args.note);
    if (!note) throw new ConvexError({ code: "APPLICATION_NOTE_REQUIRED" });
    const existing = await ctx.db
      .query("jobApplications")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", userId).eq("jobId", trackedJob.jobId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("jobApplications", existing._id, {
        updatedAt: now,
      });
      await addApplicationEvent(ctx, existing, {
        kind: "note",
        note,
        createdAt: now,
      });
      return null;
    }

    const job = trackedJob.job;
    const item = job
      ? await feedItem(ctx, job, await loadSearchProfile(ctx, userId))
      : null;
    if (!item) throw new ConvexError({ code: "JOB_NOT_AVAILABLE" });
    const applicationId = await ctx.db.insert("jobApplications", {
      userId,
      jobId: trackedJob.jobId,
      updatedAt: now,
      snapshot: item,
    });
    const application = await ctx.db.get("jobApplications", applicationId);
    if (application) {
      await addApplicationEvent(ctx, application, {
        kind: "note",
        note,
        createdAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserJob, {
      userId,
      jobId: trackedJob.jobId,
    });
    return null;
  },
});

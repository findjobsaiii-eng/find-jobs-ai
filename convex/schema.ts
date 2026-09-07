import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const workArrangement = v.union(
  v.literal("onsite"),
  v.literal("hybrid"),
  v.literal("remote"),
);

const employmentType = v.union(
  v.literal("full-time"),
  v.literal("part-time"),
  v.literal("contract"),
);

const languageProficiency = v.union(
  v.literal("basic"),
  v.literal("conversational"),
  v.literal("professional"),
  v.literal("fluent"),
  v.literal("native"),
);

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const workArrangementWithUnknown = v.union(
  workArrangement,
  v.literal("unknown"),
);
const discoveredEmploymentType = v.union(
  employmentType,
  v.literal("temporary"),
  v.literal("internship"),
  v.literal("unknown"),
);
const searchRunStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("reused"),
);

const searchPlan = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("admin"),
);

const resultSource = v.union(
  v.literal("fresh"),
  v.literal("cache"),
  v.literal("central"),
);

const jobLifecycleStatus = v.union(
  v.literal("discovered"),
  v.literal("pending_verification"),
  v.literal("verified_active"),
  v.literal("inactive"),
  v.literal("verification_failed"),
  v.literal("duplicate"),
);

const sourceActivityStatus = v.union(
  v.literal("pending_verification"),
  v.literal("verified_active"),
  v.literal("inactive"),
  v.literal("verification_failed"),
);

const relevanceComponents = v.object({
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
});

export const jobFeedItem = v.object({
  appliedAt: v.optional(v.number()),
  id: v.id("jobs"),
  title: v.string(),
  companyName: v.string(),
  sourceUrl: v.string(),
  sourceName: v.union(v.string(), v.null()),
  sourceTier: v.string(),
  locationText: v.union(v.string(), v.null()),
  workArrangement: v.string(),
  salaryMin: v.union(v.number(), v.null()),
  salaryMax: v.union(v.number(), v.null()),
  salaryCurrency: v.union(v.string(), v.null()),
  salaryPeriod: v.union(v.string(), v.null()),
  discoveredAt: v.number(),
  lastVerifiedAt: v.number(),
  relevanceScore: v.number(),
  matchReasons: v.array(v.string()),
  resultSource,
});

const schema = defineSchema({
  ...authTables,
  catalogItems: defineTable({
    kind: v.union(v.literal("jobTitle"), v.literal("skill")),
    labelEn: v.optional(v.string()),
    labelHe: v.optional(v.string()),
    normalizedKey: v.string(),
    normalizedLabels: v.array(v.string()),
    searchText: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    ownerUserId: v.optional(v.id("users")),
    source: v.union(v.literal("curated"), v.literal("user")),
    externalId: v.optional(v.string()),
    priority: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_and_externalId", ["source", "externalId"])
    .index("by_kind_and_visibility_and_active_and_priority", [
      "kind",
      "visibility",
      "active",
      "priority",
    ])
    .index("by_ownerUserId_and_kind_and_normalizedKey", [
      "ownerUserId",
      "kind",
      "normalizedKey",
    ])
    .searchIndex("search_catalog", {
      searchField: "searchText",
      filterFields: ["kind", "visibility", "ownerUserId", "active"],
    }),
  candidateProfiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    googleDisplayName: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    preferredDisplayName: v.optional(v.string()),
    targetJobTitleIds: v.optional(v.array(v.id("catalogItems"))),
    professionalSummary: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
    skillIds: v.optional(v.array(v.id("catalogItems"))),
    preferredPlaceIds: v.optional(v.array(v.string())),
    locationRadiusKm: v.optional(v.number()),
    primaryLocation: v.optional(
      v.object({
        placeId: v.string(),
        formattedAddress: v.string(),
        city: v.optional(v.string()),
        administrativeArea: v.optional(v.string()),
        country: v.string(),
        countryCode: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        radiusKm: v.number(),
      }),
    ),
    workArrangements: v.optional(v.array(workArrangement)),
    employmentTypes: v.optional(v.array(employmentType)),
    minimumMonthlySalaryIls: v.optional(v.number()),
    languages: v.optional(
      v.array(
        v.object({
          languageCode: v.string(),
          proficiency: languageProficiency,
        }),
      ),
    ),
    onboardingStep: v.number(),
    onboardingCompleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_onboardingCompleted", ["onboardingCompleted"]),
  jobApplications: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    appliedAt: v.number(),
    snapshot: jobFeedItem,
  })
    .index("by_userId_and_jobId", ["userId", "jobId"])
    .index("by_userId_and_appliedAt", ["userId", "appliedAt"]),
  dailyDiscoveryAttempts: defineTable({
    userId: v.id("users"),
    nextAttemptAt: v.number(),
    lastAttemptAt: v.number(),
    lastOutcome: v.string(),
  }).index("by_userId", ["userId"]),
  jobSearchQueries: defineTable({
    fingerprint: v.string(),
    normalizedCriteria: v.string(),
    generatedQueries: v.array(v.string()),
    createdAt: v.number(),
    lastSuccessfulRunAt: v.optional(v.number()),
  }).index("by_fingerprint", ["fingerprint"]),
  jobSearchRuns: defineTable({
    userId: v.id("users"),
    queryId: v.id("jobSearchQueries"),
    fingerprint: v.string(),
    status: searchRunStatus,
    provider: v.literal("openai"),
    model: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    usage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
        totalTokens: v.number(),
      }),
    ),
    returnedCandidateCount: v.number(),
    acceptedCount: v.number(),
    rejectedCount: v.number(),
    insertedCount: v.number(),
    deduplicatedCount: v.number(),
    errorCategory: v.optional(v.string()),
    plan: v.optional(searchPlan),
    resultSource: v.optional(resultSource),
    reservationId: v.optional(v.string()),
    queryCount: v.optional(v.number()),
    webSearchToolCallCount: v.optional(v.number()),
  })
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_userId_and_startedAt", ["userId", "startedAt"])
    .index("by_fingerprint_and_status_and_completedAt", [
      "fingerprint",
      "status",
      "completedAt",
    ]),
  jobs: defineTable({
    normalizedSourceUrl: v.string(),
    jobFingerprint: v.string(),
    contentHash: v.string(),
    title: v.string(),
    companyName: v.string(),
    sourceUrl: v.string(),
    sourceName: nullableString,
    sourceType: v.union(
      v.literal("employer"),
      v.literal("ats"),
      v.literal("job_board"),
      v.literal("other"),
    ),
    descriptionText: nullableString,
    requirementsText: nullableString,
    responsibilities: v.array(v.string()),
    requiredSkills: v.array(v.string()),
    preferredSkills: v.array(v.string()),
    requiredExperienceYearsMin: nullableNumber,
    requiredExperienceYearsMax: nullableNumber,
    educationRequirements: v.array(v.string()),
    languages: v.array(v.string()),
    country: nullableString,
    city: nullableString,
    locationText: nullableString,
    workArrangement: workArrangementWithUnknown,
    employmentType: discoveredEmploymentType,
    salaryMin: nullableNumber,
    salaryMax: nullableNumber,
    salaryCurrency: nullableString,
    salaryPeriod: v.union(
      v.literal("hour"),
      v.literal("day"),
      v.literal("month"),
      v.literal("year"),
      v.null(),
    ),
    postedAt: nullableString,
    applicationDeadline: nullableString,
    sourceEvidence: v.array(
      v.object({
        url: v.string(),
        title: nullableString,
        excerpt: nullableString,
      }),
    ),
    firstDiscoveredAt: v.number(),
    lastDiscoveredAt: v.number(),
    lastVerifiedAt: v.optional(v.number()),
    activityStatus: v.union(
      v.literal("unknown"),
      v.literal("active"),
      v.literal("inactive"),
    ),
    lifecycleStatus: v.optional(jobLifecycleStatus),
    canonicalJobId: v.optional(v.id("jobs")),
    duplicateReason: v.optional(v.string()),
    bestSourceId: v.optional(v.id("jobSources")),
    workAuthorizationRequirements: v.optional(nullableString),
  })
    .index("by_normalizedSourceUrl", ["normalizedSourceUrl"])
    .index("by_jobFingerprint", ["jobFingerprint"])
    .index("by_contentHash", ["contentHash"])
    .index("by_lifecycleStatus_and_lastVerifiedAt", [
      "lifecycleStatus",
      "lastVerifiedAt",
    ]),
  jobSources: defineTable({
    jobId: v.id("jobs"),
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    finalUrl: v.optional(v.string()),
    domain: v.string(),
    sourceTier: v.union(
      v.literal("employer"),
      v.literal("ats"),
      v.literal("job_board"),
      v.literal("aggregator"),
    ),
    externalJobId: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    lastVerifiedAt: v.optional(v.number()),
    activityStatus: sourceActivityStatus,
    verificationMethod: v.optional(v.string()),
    verificationEvidence: v.optional(v.string()),
    duplicateReason: v.optional(v.string()),
    canonicalJobId: v.optional(v.id("jobs")),
  })
    .index("by_normalizedUrl", ["normalizedUrl"])
    .index("by_finalUrl", ["finalUrl"])
    .index("by_domain_and_externalJobId", ["domain", "externalJobId"])
    .index("by_jobId", ["jobId"])
    .index("by_jobId_and_activityStatus", ["jobId", "activityStatus"]),
  jobDiscoveries: defineTable({
    jobId: v.id("jobs"),
    searchRunId: v.id("jobSearchRuns"),
    userId: v.id("users"),
    queryId: v.id("jobSearchQueries"),
    discoveredAt: v.number(),
    reused: v.boolean(),
  })
    .index("by_userId_and_discoveredAt", ["userId", "discoveredAt"])
    .index("by_searchRunId", ["searchRunId"])
    .index("by_jobId_and_userId", ["jobId", "userId"]),
  jobMatches: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    searchRunId: v.id("jobSearchRuns"),
    outcome: v.union(v.literal("eligible"), v.literal("excluded")),
    exclusionReasons: v.array(v.string()),
    relevanceScore: v.number(),
    scoreComponents: relevanceComponents,
    matchReasons: v.array(v.string()),
    resultSource,
    evaluatedAt: v.number(),
  })
    .index("by_userId_and_outcome_and_relevanceScore", [
      "userId",
      "outcome",
      "relevanceScore",
    ])
    .index("by_userId_and_jobId", ["userId", "jobId"])
    .index("by_searchRunId", ["searchRunId"]),
  userEntitlements: defineTable({
    userId: v.id("users"),
    plan: searchPlan,
    active: v.boolean(),
    expiresAt: v.optional(v.number()),
    source: v.literal("manual"),
    grantedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  jobSearchUsage: defineTable({
    userId: v.id("users"),
    operationType: v.literal("job_discovery"),
    plan: searchPlan,
    searchRunId: v.optional(v.id("jobSearchRuns")),
    reservationId: v.string(),
    status: v.union(
      v.literal("reserved"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("released"),
    ),
    freshProviderCall: v.boolean(),
    providerRequestStarted: v.boolean(),
    resultSource,
    queryCount: v.number(),
    webSearchToolCallCount: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    acceptedJobs: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    quotaWindowIdentifier: v.string(),
    globalDayKey: v.string(),
  })
    .index("by_reservationId", ["reservationId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_globalDayKey_and_status", ["globalDayKey", "status"]),
  jobSearchGlobalUsage: defineTable({
    dayKey: v.string(),
    freshRuns: v.number(),
    queryCount: v.number(),
    activeRuns: v.number(),
    updatedAt: v.number(),
  }).index("by_dayKey", ["dayKey"]),
});

export default schema;

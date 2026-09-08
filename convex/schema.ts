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

const deepReviewStatus = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
);

const deepReviewVerdict = v.union(
  v.literal("strong"),
  v.literal("good"),
  v.literal("stretch"),
  v.literal("low"),
);

const jobLifecycleStatus = v.union(
  v.literal("discovered"),
  v.literal("pending_verification"),
  v.literal("verified_active"),
  v.literal("probably_active"),
  v.literal("closed"),
  v.literal("expired"),
  v.literal("unknown"),
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

const profileOverrideField = v.union(
  v.literal("targetJobTitles"),
  v.literal("professionalSummary"),
  v.literal("yearsOfExperience"),
  v.literal("skills"),
  v.literal("location"),
  v.literal("workArrangements"),
  v.literal("employmentTypes"),
  v.literal("minimumMonthlySalaryIls"),
  v.literal("languages"),
  v.literal("seniority"),
);

const normalizedProfileLocation = v.object({
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
  domain: v.optional(v.number()),
  seniority: v.optional(v.number()),
  preferences: v.optional(v.number()),
});

export const deepReviewView = v.object({
  status: deepReviewStatus,
  language: v.union(v.literal("en"), v.literal("he")),
  stale: v.boolean(),
  matchPercentage: v.optional(v.number()),
  verdict: v.optional(deepReviewVerdict),
  summary: v.optional(v.string()),
  strengths: v.optional(
    v.array(v.object({ title: v.string(), detail: v.string() })),
  ),
  gaps: v.optional(
    v.array(
      v.object({
        requirement: v.string(),
        currentEvidence: v.string(),
        howToClose: v.string(),
        importance: v.union(
          v.literal("must_have"),
          v.literal("important"),
          v.literal("minor"),
        ),
      }),
    ),
  ),
  resumeId: v.optional(v.id("resumeDocuments")),
  resumeName: v.optional(v.string()),
  resumeRationale: v.optional(v.string()),
  resumeChanges: v.optional(
    v.array(
      v.object({
        section: v.string(),
        change: v.string(),
        reason: v.string(),
      }),
    ),
  ),
  companyWebsiteUrl: v.optional(v.union(v.string(), v.null())),
  directApplicationUrl: v.optional(v.union(v.string(), v.null())),
  applicationNote: v.optional(v.string()),
  interviewFocus: v.optional(v.array(v.string())),
  updatedAt: v.number(),
  errorCode: v.optional(v.string()),
});

export const jobFeedItem = v.object({
  appliedAt: v.optional(v.number()),
  id: v.id("jobs"),
  title: v.string(),
  companyName: v.string(),
  descriptionText: v.optional(nullableString),
  requiredSkills: v.optional(v.array(v.string())),
  postedAt: v.optional(nullableString),
  unavailable: v.optional(v.boolean()),
  sourceUrl: v.string(),
  sourceName: v.union(v.string(), v.null()),
  sourceTier: v.string(),
  locationText: v.union(v.string(), v.null()),
  locationNames: v.optional(v.object({ en: v.string(), he: v.string() })),
  workArrangement: v.string(),
  salaryMin: v.union(v.number(), v.null()),
  salaryMax: v.union(v.number(), v.null()),
  salaryCurrency: v.union(v.string(), v.null()),
  salaryPeriod: v.union(v.string(), v.null()),
  discoveredAt: v.number(),
  lastVerifiedAt: v.number(),
  relevanceScore: v.number(),
  scoreComponents: v.optional(relevanceComponents),
  matchReasons: v.array(v.string()),
  matchHighlights: v.optional(
    v.object({
      targetRole: v.optional(v.string()),
      pastRole: v.optional(v.string()),
      skills: v.array(v.string()),
      domain: v.optional(v.string()),
      location: v.boolean(),
    }),
  ),
  deepReview: v.optional(deepReviewView),
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
    aliases: v.optional(v.array(v.string())),
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
    primaryLocation: v.optional(normalizedProfileLocation),
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
    activeResumeId: v.optional(v.id("resumeDocuments")),
    cvReviewPending: v.optional(v.boolean()),
    profileSourceVersion: v.optional(v.number()),
    manualOverrideFields: v.optional(v.array(profileOverrideField)),
    seniority: v.optional(
      v.union(
        v.literal("entry"),
        v.literal("mid"),
        v.literal("senior"),
        v.literal("lead"),
        v.literal("executive"),
        v.literal("unknown"),
      ),
    ),
    cvCareerProfile: v.optional(
      v.object({
        resumeId: v.id("resumeDocuments"),
        currentTitle: v.optional(v.string()),
        normalizedPastRoles: v.array(v.string()),
        seniority: v.string(),
        domains: v.array(v.string()),
        coreSkills: v.array(v.string()),
        totalExperienceMonths: v.number(),
        experienceByDomain: v.array(
          v.object({ domain: v.string(), months: v.number() }),
        ),
        updatedAt: v.number(),
      }),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_onboardingCompleted", ["onboardingCompleted"]),
  resumeDocuments: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    displayName: v.optional(v.string()),
    note: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
    activateOnSuccess: v.optional(v.boolean()),
    replacementForId: v.optional(v.id("resumeDocuments")),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("needs_confirmation"),
      v.literal("failed"),
      v.literal("replaced"),
    ),
    extractedText: v.optional(v.string()),
    structuredProfileJson: v.optional(v.string()),
    currentTitle: v.optional(v.string()),
    professionalDomain: v.optional(v.string()),
    seniority: v.optional(
      v.union(
        v.literal("entry"),
        v.literal("mid"),
        v.literal("senior"),
        v.literal("lead"),
        v.literal("executive"),
        v.literal("unknown"),
      ),
    ),
    summary: v.optional(v.string()),
    targetJobTitleIds: v.optional(v.array(v.id("catalogItems"))),
    skillIds: v.optional(v.array(v.id("catalogItems"))),
    normalizedLocation: v.optional(normalizedProfileLocation),
    totalExperienceMonths: v.optional(v.number()),
    coreSkills: v.optional(v.array(v.string())),
    normalizedPastRoles: v.optional(v.array(v.string())),
    domains: v.optional(v.array(v.string())),
    experienceByDomain: v.optional(
      v.array(v.object({ domain: v.string(), months: v.number() })),
    ),
    extractedLanguages: v.optional(
      v.array(
        v.object({
          languageCode: v.string(),
          proficiency: languageProficiency,
        }),
      ),
    ),
    confidence: v.optional(
      v.object({
        currentTitle: v.string(),
        location: v.string(),
        dates: v.string(),
        targetRoles: v.string(),
      }),
    ),
    failureCode: v.optional(v.string()),
    processingDiagnostics: v.optional(
      v.object({
        stage: v.string(),
        detectedFileType: v.optional(v.string()),
        byteSize: v.optional(v.number()),
        pageCount: v.optional(v.number()),
        extractedCharacterCount: v.optional(v.number()),
        meaningfulCharacterCount: v.optional(v.number()),
        extractionStatus: v.string(),
        structuredParserStatus: v.string(),
        technicalMessage: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_userId_and_status", ["userId", "status"]),
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
    dayKey: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    lastAttemptAt: v.number(),
    lastOutcome: v.string(),
  }).index("by_userId", ["userId"]),
  jobSearchQueries: defineTable({
    lastAttemptDay: v.optional(v.string()),
    lastAttemptRunId: v.optional(v.id("jobSearchRuns")),
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
    manual: v.optional(v.boolean()),
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
    rawProviderJson: v.optional(v.string()),
    geo: v.optional(
      v.object({
        placeId: v.string(),
        countryCode: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        precision: v.literal("locality_centroid"),
        labelEn: v.optional(v.string()),
        labelHe: v.optional(v.string()),
      }),
    ),
    normalizedSourceUrl: v.string(),
    jobFingerprint: v.string(),
    contentHash: v.string(),
    canonicalKey: v.optional(v.string()),
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
    closedAt: v.optional(v.number()),
    activityReason: v.optional(v.string()),
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
    .index("by_canonicalKey", ["canonicalKey"])
    .index("by_lifecycleStatus_and_lastVerifiedAt", [
      "lifecycleStatus",
      "lastVerifiedAt",
    ]),
  jobSources: defineTable({
    jobId: v.id("jobs"),
    sourceName: v.optional(nullableString),
    rawSourceText: v.optional(v.string()),
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
    providerKey: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    lastVerifiedAt: v.optional(v.number()),
    lastVerificationAttemptAt: v.optional(v.number()),
    nextVerificationAt: v.optional(v.number()),
    verificationFailureCount: v.optional(v.number()),
    verificationLeaseUntil: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    closureReason: v.optional(v.string()),
    activityStatus: sourceActivityStatus,
    verificationMethod: v.optional(v.string()),
    verificationEvidence: v.optional(v.string()),
    duplicateReason: v.optional(v.string()),
    canonicalJobId: v.optional(v.id("jobs")),
  })
    .index("by_normalizedUrl", ["normalizedUrl"])
    .index("by_finalUrl", ["finalUrl"])
    .index("by_domain_and_externalJobId", ["domain", "externalJobId"])
    .index("by_providerKey", ["providerKey"])
    .index("by_nextVerificationAt", ["nextVerificationAt"])
    .index("by_jobId", ["jobId"])
    .index("by_jobId_and_activityStatus", ["jobId", "activityStatus"]),
  jobIngestionEvents: defineTable({
    jobId: v.id("jobs"),
    sourceId: v.id("jobSources"),
    sourceUrl: v.string(),
    providerKey: v.optional(v.string()),
    contentHash: v.string(),
    rawProviderJson: v.optional(v.string()),
    mergeReason: v.optional(v.string()),
    observedAt: v.number(),
  })
    .index("by_jobId_and_observedAt", ["jobId", "observedAt"])
    .index("by_sourceId_and_observedAt", ["sourceId", "observedAt"]),
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
    searchRunId: v.optional(v.id("jobSearchRuns")),
    profileRevision: v.optional(v.number()),
    displayEligible: v.optional(v.boolean()),
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
    .index("by_userId_profileRevision_displayEligible_relevanceScore", [
      "userId",
      "profileRevision",
      "displayEligible",
      "relevanceScore",
    ])
    .index("by_searchRunId", ["searchRunId"]),
  jobDeepReviews: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    resumeId: v.optional(v.id("resumeDocuments")),
    status: deepReviewStatus,
    requestId: v.optional(v.string()),
    language: v.union(v.literal("en"), v.literal("he")),
    profileRevision: v.number(),
    jobContentHash: v.string(),
    model: v.optional(v.string()),
    matchPercentage: v.optional(v.number()),
    verdict: v.optional(deepReviewVerdict),
    summary: v.optional(v.string()),
    strengths: v.optional(
      v.array(v.object({ title: v.string(), detail: v.string() })),
    ),
    gaps: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          currentEvidence: v.string(),
          howToClose: v.string(),
          importance: v.union(
            v.literal("must_have"),
            v.literal("important"),
            v.literal("minor"),
          ),
        }),
      ),
    ),
    resumeName: v.optional(v.string()),
    resumeRationale: v.optional(v.string()),
    resumeChanges: v.optional(
      v.array(
        v.object({
          section: v.string(),
          change: v.string(),
          reason: v.string(),
        }),
      ),
    ),
    companyWebsiteUrl: v.optional(v.union(v.string(), v.null())),
    directApplicationUrl: v.optional(v.union(v.string(), v.null())),
    applicationNote: v.optional(v.string()),
    interviewFocus: v.optional(v.array(v.string())),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
    errorCode: v.optional(v.string()),
  })
    .index("by_userId_and_jobId", ["userId", "jobId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"]),
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

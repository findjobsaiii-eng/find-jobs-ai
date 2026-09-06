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
  })
    .index("by_normalizedSourceUrl", ["normalizedSourceUrl"])
    .index("by_jobFingerprint", ["jobFingerprint"]),
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
});

export default schema;

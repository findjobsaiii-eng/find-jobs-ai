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
  locations: defineTable({
    code: v.string(),
    kind: v.union(
      v.literal("locality"),
      v.literal("region"),
      v.literal("nationwide"),
    ),
    nameHe: v.string(),
    nameEn: v.optional(v.string()),
    searchText: v.string(),
    parentRegionCode: v.optional(v.string()),
    source: v.string(),
    sourceVersion: v.string(),
    priority: v.number(),
    active: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_active_and_priority", ["active", "priority"])
    .searchIndex("search_locations", {
      searchField: "searchText",
      filterFields: ["active"],
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
    preferredLocationCodes: v.optional(v.array(v.string())),
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
});

export default schema;

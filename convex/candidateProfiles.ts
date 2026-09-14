import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import schema from "./schema";

const WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote"] as const;
const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract"] as const;
const LANGUAGE_PROFICIENCIES = [
  "basic",
  "conversational",
  "professional",
  "fluent",
  "native",
] as const;
const SUPPORTED_LANGUAGE_CODES = [
  "he",
  "en",
  "ar",
  "ru",
  "fr",
  "am",
  "es",
  "uk",
  "ro",
  "yi",
] as const;

export const PROFILE_LIMITS = {
  preferredDisplayName: { min: 2, max: 80 },
  targetJobTitles: { min: 1, max: 5 },
  professionalSummary: { min: 40, max: 1_200 },
  yearsOfExperience: { min: 0, max: 60 },
  skills: { min: 1, max: 30 },
  preferredLocations: { min: 1, max: 10 },
  placeId: { max: 512 },
  locationText: { max: 300 },
  workArrangements: { min: 1, max: 3 },
  employmentTypes: { min: 1, max: 3 },
  languages: { min: 1, max: 10 },
  minimumMonthlySalaryIls: { min: 1_000, max: 200_000 },
  onboardingStep: { min: 1, max: 4 },
} as const;

// 50 km and 200 km remain valid for profiles saved before the focused
// onboarding presets were simplified.
const LOCATION_RADIUS_OPTIONS_KM = [
  5, 10, 15, 25, 40, 50, 60, 100, 200,
] as const;

const workArrangementValidator = v.union(
  v.literal("onsite"),
  v.literal("hybrid"),
  v.literal("remote"),
);
const employmentTypeValidator = v.union(
  v.literal("full-time"),
  v.literal("part-time"),
  v.literal("contract"),
);
const languageProficiencyValidator = v.union(
  v.literal("basic"),
  v.literal("conversational"),
  v.literal("professional"),
  v.literal("fluent"),
  v.literal("native"),
);
const languageValidator = v.object({
  languageCode: v.string(),
  proficiency: languageProficiencyValidator,
});

const primaryLocationValidator = v.object({
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

const editableFieldsValidator = v.object({
  preferredDisplayName: v.optional(v.union(v.string(), v.null())),
  targetJobTitleIds: v.optional(v.array(v.id("catalogItems"))),
  professionalSummary: v.optional(v.union(v.string(), v.null())),
  yearsOfExperience: v.optional(v.union(v.number(), v.null())),
  skillIds: v.optional(v.array(v.id("catalogItems"))),
  preferredPlaceIds: v.optional(v.array(v.string())),
  locationRadiusKm: v.optional(v.union(v.number(), v.null())),
  primaryLocation: v.optional(v.union(primaryLocationValidator, v.null())),
  workArrangements: v.optional(v.array(workArrangementValidator)),
  employmentTypes: v.optional(v.array(employmentTypeValidator)),
  minimumMonthlySalaryIls: v.optional(v.union(v.number(), v.null())),
  languages: v.optional(v.array(languageValidator)),
});

type EditableProfile = Pick<
  Doc<"candidateProfiles">,
  | "preferredDisplayName"
  | "targetJobTitleIds"
  | "professionalSummary"
  | "yearsOfExperience"
  | "skillIds"
  | "preferredPlaceIds"
  | "locationRadiusKm"
  | "primaryLocation"
  | "workArrangements"
  | "employmentTypes"
  | "minimumMonthlySalaryIls"
  | "languages"
>;
type EditableProfilePatch = Partial<EditableProfile>;
type EditableProfileInput = {
  preferredDisplayName?: string | null;
  targetJobTitleIds?: Id<"catalogItems">[];
  professionalSummary?: string | null;
  yearsOfExperience?: number | null;
  skillIds?: Id<"catalogItems">[];
  preferredPlaceIds?: string[];
  locationRadiusKm?: number | null;
  primaryLocation?: {
    placeId: string;
    formattedAddress: string;
    city?: string;
    administrativeArea?: string;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
    radiusKm: number;
  } | null;
  workArrangements?: EditableProfile["workArrangements"];
  employmentTypes?: EditableProfile["employmentTypes"];
  minimumMonthlySalaryIls?: number | null;
  languages?: EditableProfile["languages"];
};

type ProfileField =
  | "preferredDisplayName"
  | "targetJobTitles"
  | "professionalSummary"
  | "yearsOfExperience"
  | "skills"
  | "preferredLocations"
  | "locationRadiusKm"
  | "workArrangements"
  | "employmentTypes"
  | "minimumMonthlySalaryIls"
  | "languages";

function validationError(field: ProfileField, reason: string): never {
  throw new ConvexError({ code: "VALIDATION_ERROR", field, reason });
}

function normalizeWhitespace(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeText(value: string, field: ProfileField, max: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length > max) validationError(field, "length");
  return normalized;
}

function normalizeNumber(
  value: number,
  field: ProfileField,
  min: number,
  max: number,
) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    validationError(field, "range");
  }
  return value;
}

function normalizeIds<T extends string>(
  values: T[],
  field: ProfileField,
  max: number,
) {
  const unique = [...new Set(values)];
  if (unique.length > max) validationError(field, "list_size");
  return unique;
}

function normalizeEditableFields(
  values: EditableProfileInput,
): EditableProfilePatch {
  const normalized: EditableProfilePatch = {};
  if (values.preferredDisplayName !== undefined) {
    normalized.preferredDisplayName =
      values.preferredDisplayName === null
        ? undefined
        : normalizeText(
            values.preferredDisplayName,
            "preferredDisplayName",
            PROFILE_LIMITS.preferredDisplayName.max,
          );
  }
  if (values.targetJobTitleIds !== undefined) {
    normalized.targetJobTitleIds = normalizeIds(
      values.targetJobTitleIds,
      "targetJobTitles",
      PROFILE_LIMITS.targetJobTitles.max,
    );
  }
  if (values.professionalSummary !== undefined) {
    normalized.professionalSummary =
      values.professionalSummary === null
        ? undefined
        : normalizeText(
            values.professionalSummary,
            "professionalSummary",
            PROFILE_LIMITS.professionalSummary.max,
          );
  }
  if (values.yearsOfExperience !== undefined) {
    normalized.yearsOfExperience =
      values.yearsOfExperience === null
        ? undefined
        : normalizeNumber(
            values.yearsOfExperience,
            "yearsOfExperience",
            PROFILE_LIMITS.yearsOfExperience.min,
            PROFILE_LIMITS.yearsOfExperience.max,
          );
  }
  if (values.skillIds !== undefined) {
    normalized.skillIds = normalizeIds(
      values.skillIds,
      "skills",
      PROFILE_LIMITS.skills.max,
    );
  }
  if (values.preferredPlaceIds !== undefined) {
    const placeIds = values.preferredPlaceIds.map((value) =>
      normalizeText(value, "preferredLocations", PROFILE_LIMITS.placeId.max),
    );
    if (placeIds.some((value) => value.length === 0)) {
      validationError("preferredLocations", "invalid_reference");
    }
    normalized.preferredPlaceIds = normalizeIds(
      placeIds,
      "preferredLocations",
      PROFILE_LIMITS.preferredLocations.max,
    );
  }
  if (values.locationRadiusKm !== undefined) {
    if (
      values.locationRadiusKm === null ||
      !LOCATION_RADIUS_OPTIONS_KM.includes(
        values.locationRadiusKm as (typeof LOCATION_RADIUS_OPTIONS_KM)[number],
      )
    ) {
      validationError("locationRadiusKm", "invalid_option");
    }
    normalized.locationRadiusKm = values.locationRadiusKm;
  }
  if (values.primaryLocation !== undefined) {
    if (values.primaryLocation === null) {
      normalized.primaryLocation = undefined;
    } else {
      const location = values.primaryLocation;
      const placeId = normalizeText(
        location.placeId,
        "preferredLocations",
        PROFILE_LIMITS.placeId.max,
      );
      const formattedAddress = normalizeText(
        location.formattedAddress,
        "preferredLocations",
        PROFILE_LIMITS.locationText.max,
      );
      const country = normalizeText(
        location.country,
        "preferredLocations",
        PROFILE_LIMITS.locationText.max,
      );
      const countryCode = normalizeWhitespace(location.countryCode)
        .toLocaleUpperCase("en-US")
        .slice(0, 2);
      if (
        !placeId ||
        !formattedAddress ||
        !country ||
        !/^[A-Z]{2}$/u.test(countryCode) ||
        !Number.isFinite(location.latitude) ||
        location.latitude < -90 ||
        location.latitude > 90 ||
        !Number.isFinite(location.longitude) ||
        location.longitude < -180 ||
        location.longitude > 180 ||
        !LOCATION_RADIUS_OPTIONS_KM.includes(
          location.radiusKm as (typeof LOCATION_RADIUS_OPTIONS_KM)[number],
        )
      ) {
        validationError("preferredLocations", "invalid_location");
      }
      normalized.primaryLocation = {
        placeId,
        formattedAddress,
        city: location.city
          ? normalizeText(
              location.city,
              "preferredLocations",
              PROFILE_LIMITS.locationText.max,
            )
          : undefined,
        administrativeArea: location.administrativeArea
          ? normalizeText(
              location.administrativeArea,
              "preferredLocations",
              PROFILE_LIMITS.locationText.max,
            )
          : undefined,
        country,
        countryCode,
        latitude: location.latitude,
        longitude: location.longitude,
        radiusKm: location.radiusKm,
      };
    }
  }
  if (values.workArrangements !== undefined) {
    const unique = [...new Set(values.workArrangements)];
    if (
      unique.length > PROFILE_LIMITS.workArrangements.max ||
      unique.some((value) => !WORK_ARRANGEMENTS.includes(value))
    ) {
      validationError("workArrangements", "invalid_option");
    }
    normalized.workArrangements = unique;
  }
  if (values.employmentTypes !== undefined) {
    const unique = [...new Set(values.employmentTypes)];
    if (
      unique.length > PROFILE_LIMITS.employmentTypes.max ||
      unique.some((value) => !EMPLOYMENT_TYPES.includes(value))
    ) {
      validationError("employmentTypes", "invalid_option");
    }
    normalized.employmentTypes = unique;
  }
  if (values.minimumMonthlySalaryIls !== undefined) {
    normalized.minimumMonthlySalaryIls =
      values.minimumMonthlySalaryIls === null
        ? undefined
        : normalizeNumber(
            values.minimumMonthlySalaryIls,
            "minimumMonthlySalaryIls",
            PROFILE_LIMITS.minimumMonthlySalaryIls.min,
            PROFILE_LIMITS.minimumMonthlySalaryIls.max,
          );
  }
  if (values.languages !== undefined) {
    if (values.languages.length > PROFILE_LIMITS.languages.max) {
      validationError("languages", "list_size");
    }
    const seen = new Set<string>();
    normalized.languages = values.languages.map((language) => {
      if (
        !SUPPORTED_LANGUAGE_CODES.includes(
          language.languageCode as (typeof SUPPORTED_LANGUAGE_CODES)[number],
        ) ||
        !LANGUAGE_PROFICIENCIES.includes(language.proficiency) ||
        seen.has(language.languageCode)
      ) {
        validationError("languages", "invalid_option");
      }
      seen.add(language.languageCode);
      return language;
    });
  }
  return normalized;
}

async function assertReferences(
  ctx: MutationCtx,
  userId: Id<"users">,
  profile: EditableProfilePatch,
) {
  const [titles, skills] = await Promise.all([
    Promise.all(
      (profile.targetJobTitleIds ?? []).map((id) =>
        ctx.db.get("catalogItems", id),
      ),
    ),
    Promise.all(
      (profile.skillIds ?? []).map((id) => ctx.db.get("catalogItems", id)),
    ),
  ]);
  for (const item of titles) {
    if (
      !item ||
      item.kind !== "jobTitle" ||
      !item.active ||
      (item.visibility === "private" && item.ownerUserId !== userId)
    ) {
      validationError("targetJobTitles", "invalid_reference");
    }
  }
  for (const item of skills) {
    if (
      !item ||
      item.kind !== "skill" ||
      !item.active ||
      (item.visibility === "private" && item.ownerUserId !== userId)
    ) {
      validationError("skills", "invalid_reference");
    }
  }
}

function assertComplete(profile: EditableProfilePatch) {
  if (
    !profile.preferredDisplayName ||
    profile.preferredDisplayName.length <
      PROFILE_LIMITS.preferredDisplayName.min
  ) {
    validationError("preferredDisplayName", "required");
  }
  if (
    (profile.targetJobTitleIds?.length ?? 0) <
    PROFILE_LIMITS.targetJobTitles.min
  ) {
    validationError("targetJobTitles", "list_size");
  }
  if (
    !profile.professionalSummary ||
    profile.professionalSummary.length < PROFILE_LIMITS.professionalSummary.min
  ) {
    validationError("professionalSummary", "length");
  }
  if (profile.yearsOfExperience === undefined) {
    validationError("yearsOfExperience", "required");
  }
  if ((profile.skillIds?.length ?? 0) < PROFILE_LIMITS.skills.min) {
    validationError("skills", "list_size");
  }
  if (
    (profile.preferredPlaceIds?.length ?? 0) <
    PROFILE_LIMITS.preferredLocations.min
  ) {
    validationError("preferredLocations", "list_size");
  }
  if (
    !profile.primaryLocation ||
    profile.primaryLocation.placeId !== profile.preferredPlaceIds?.[0]
  ) {
    validationError("preferredLocations", "location_reconfirmation_required");
  }
  if (
    !LOCATION_RADIUS_OPTIONS_KM.includes(
      profile.locationRadiusKm as (typeof LOCATION_RADIUS_OPTIONS_KM)[number],
    )
  ) {
    validationError("locationRadiusKm", "invalid_option");
  }
  if (profile.primaryLocation.radiusKm !== profile.locationRadiusKm) {
    validationError("locationRadiusKm", "location_radius_mismatch");
  }
  if (
    (profile.workArrangements?.length ?? 0) <
    PROFILE_LIMITS.workArrangements.min
  ) {
    validationError("workArrangements", "list_size");
  }
  if (
    (profile.employmentTypes?.length ?? 0) < PROFILE_LIMITS.employmentTypes.min
  ) {
    validationError("employmentTypes", "list_size");
  }
  if (profile.minimumMonthlySalaryIls === undefined) {
    validationError("minimumMonthlySalaryIls", "required");
  }
  if ((profile.languages?.length ?? 0) < PROFILE_LIMITS.languages.min) {
    validationError("languages", "list_size");
  }
}

async function requireCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
  const user = await ctx.db.get("users", userId);
  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return { userId, user };
}

async function getProfile(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("candidateProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

function normalizeProviderValue(value: string | undefined, max: number) {
  if (!value) return undefined;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized.slice(0, max) : undefined;
}

const catalogSelectionValidator = v.object({
  id: v.id("catalogItems"),
  labelEn: v.union(v.string(), v.null()),
  labelHe: v.union(v.string(), v.null()),
  isCustom: v.boolean(),
});
export const getCurrent = query({
  args: {},
  returns: v.object({
    identity: v.object({
      userId: v.id("users"),
      email: v.union(v.string(), v.null()),
      googleDisplayName: v.union(v.string(), v.null()),
      profileImage: v.union(v.string(), v.null()),
    }),
    profile: v.union(v.null(), schema.doc("candidateProfiles")),
    selections: v.object({
      targetJobTitles: v.array(catalogSelectionValidator),
      skills: v.array(catalogSelectionValidator),
    }),
  }),
  handler: async (ctx) => {
    const { userId, user } = await requireCurrentUser(ctx);
    const profile = await getProfile(ctx, userId);
    const catalogSelections = await Promise.all(
      [...(profile?.targetJobTitleIds ?? []), ...(profile?.skillIds ?? [])].map(
        (id) => ctx.db.get("catalogItems", id),
      ),
    );
    const visibleCatalog = catalogSelections.filter(
      (item): item is Doc<"catalogItems"> =>
        Boolean(
          item?.active &&
          (item.visibility === "public" || item.ownerUserId === userId),
        ),
    );
    const toCatalogSelection = (item: Doc<"catalogItems">) => ({
      id: item._id,
      labelEn: item.labelEn ?? null,
      labelHe: item.labelHe ?? null,
      isCustom: item.visibility === "private",
    });
    const targetJobTitles = [];
    const skills = [];
    for (const item of visibleCatalog) {
      const selection = toCatalogSelection(item);
      if (item.kind === "jobTitle") targetJobTitles.push(selection);
      else skills.push(selection);
    }
    return {
      identity: {
        userId,
        email: normalizeProviderValue(user.email, 320) ?? null,
        googleDisplayName: normalizeProviderValue(user.name, 120) ?? null,
        profileImage: normalizeProviderValue(user.image, 2_048) ?? null,
      },
      profile,
      selections: {
        targetJobTitles,
        skills,
      },
    };
  },
});

export const saveCurrent = mutation({
  args: {
    values: editableFieldsValidator,
    onboardingStep: v.number(),
    complete: v.boolean(),
  },
  returns: schema.doc("candidateProfiles"),
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx);
    const email = normalizeProviderValue(user.email, 320);
    if (!email) throw new ConvexError({ code: "MISSING_GOOGLE_EMAIL" });
    if (
      !Number.isSafeInteger(args.onboardingStep) ||
      args.onboardingStep < PROFILE_LIMITS.onboardingStep.min ||
      args.onboardingStep > PROFILE_LIMITS.onboardingStep.max
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        field: "onboardingStep",
        reason: "range",
      });
    }

    const existing = await getProfile(ctx, userId);
    const normalized = normalizeEditableFields(args.values);
    const overrides = new Set(existing?.manualOverrideFields ?? []);
    for (const field of Object.keys(args.values)) {
      if (field === "targetJobTitleIds") overrides.add("targetJobTitles");
      else if (field === "skillIds") overrides.add("skills");
      else if (
        field === "primaryLocation" ||
        field === "preferredPlaceIds" ||
        field === "locationRadiusKm"
      )
        overrides.add("location");
      else if (field !== "preferredDisplayName")
        overrides.add(
          field as NonNullable<
            Doc<"candidateProfiles">["manualOverrideFields"]
          >[number],
        );
    }
    if (
      normalized.locationRadiusKm !== undefined &&
      !("primaryLocation" in normalized) &&
      existing?.primaryLocation
    ) {
      normalized.primaryLocation = {
        ...existing.primaryLocation,
        radiusKm: normalized.locationRadiusKm,
      };
    }
    if (
      normalized.primaryLocation &&
      normalized.locationRadiusKm === undefined
    ) {
      normalized.locationRadiusKm = normalized.primaryLocation.radiusKm;
    }
    const merged: EditableProfilePatch = { ...existing, ...normalized };
    await assertReferences(ctx, userId, merged);
    if (args.complete) assertComplete(merged);

    const now = Date.now();
    const identityFields = {
      userId,
      email: email.toLocaleLowerCase("en-US"),
      googleDisplayName: normalizeProviderValue(user.name, 120),
      profileImage: normalizeProviderValue(user.image, 2_048),
    };
    if (existing) {
      await ctx.db.patch("candidateProfiles", existing._id, {
        ...identityFields,
        ...normalized,
        onboardingStep: args.complete ? 4 : args.onboardingStep,
        onboardingCompleted: existing.onboardingCompleted || args.complete,
        manualOverrideFields: [...overrides],
        cvReviewPending: args.complete ? false : existing.cvReviewPending,
        updatedAt: now,
        completedAt: existing.completedAt ?? (args.complete ? now : undefined),
      });
      const updated = await ctx.db.get("candidateProfiles", existing._id);
      if (!updated) throw new Error("Candidate profile update failed");
      if (updated.onboardingCompleted && !updated.cvReviewPending) {
        await ctx.scheduler.runAfter(0, internal.dailyDiscovery.enqueueUser, {
          userId,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.jobMatching.reconcileUserPage,
          {
            userId,
            lifecycleStatus: "verified_active",
            cursor: null,
            expectedProfileRevision: updated.updatedAt,
          },
        );
      }
      return updated;
    }

    const id = await ctx.db.insert("candidateProfiles", {
      ...identityFields,
      ...normalized,
      onboardingStep: args.complete ? 4 : args.onboardingStep,
      onboardingCompleted: args.complete,
      createdAt: now,
      updatedAt: now,
      completedAt: args.complete ? now : undefined,
    });
    const created = await ctx.db.get("candidateProfiles", id);
    if (!created) throw new Error("Candidate profile creation failed");
    if (created.onboardingCompleted) {
      await ctx.scheduler.runAfter(0, internal.dailyDiscovery.enqueueUser, {
        userId,
      });
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserPage, {
        userId,
        lifecycleStatus: "verified_active",
        cursor: null,
        expectedProfileRevision: created.updatedAt,
      });
    }
    return created;
  },
});

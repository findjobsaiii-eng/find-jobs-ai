import { cancelOnboardingReminders } from "./onboardingReminders";
import { observeReferenceTerms } from "./referenceIdentity";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import schema from "./schema";
import { currentProfileValidator, loadProfileView } from "./candidateProfiles";
import {
  candidateQualificationsValidator,
  normalizeCandidateQualifications,
} from "./candidateQualifications";
import { upsertSkillCatalogItem } from "./skillIdentity";
import { recordProductEvent } from "./productAnalytics";

const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 10 * 1024 * 1024;
const UPLOADS_PER_HOUR = 10;
const UPLOAD_WINDOW_MS = 60 * 60 * 1000;

const processingDiagnosticsValidator = v.object({
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
});

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
  const user = await ctx.db.get("users", userId);
  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return { userId, user };
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const now = Date.now();
    const rate = await ctx.db
      .query("resumeUploadRateLimits")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (rate && now - rate.windowStartedAt < UPLOAD_WINDOW_MS) {
      if (rate.attempts >= UPLOADS_PER_HOUR)
        throw new ConvexError({ code: "UPLOAD_RATE_LIMITED" });
      await ctx.db.patch("resumeUploadRateLimits", rate._id, {
        attempts: rate.attempts + 1,
      });
    } else if (rate) {
      await ctx.db.patch("resumeUploadRateLimits", rate._id, {
        windowStartedAt: now,
        attempts: 1,
      });
    } else {
      await ctx.db.insert("resumeUploadRateLimits", {
        userId,
        windowStartedAt: now,
        attempts: 1,
      });
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const createFromUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    displayName: v.optional(v.string()),
    note: v.optional(v.string()),
    activateOnSuccess: v.optional(v.boolean()),
    replacementForId: v.optional(v.id("resumeDocuments")),
  },
  returns: v.id("resumeDocuments"),
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const profile = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const activateOnSuccess =
      !profile?.onboardingCompleted && args.activateOnSuccess !== false;
    const savedResumes = await ctx.db
      .query("resumeDocuments")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .take(25);
    if (
      savedResumes.length >= 25 &&
      (!args.replacementForId || profile?.onboardingCompleted)
    )
      throw new ConvexError({ code: "RESUME_LIMIT_REACHED" });
    const alreadyUsed = await ctx.db
      .query("resumeDocuments")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (alreadyUsed) throw new ConvexError({ code: "FILE_ALREADY_USED" });
    const replacement = args.replacementForId
      ? await ctx.db.get("resumeDocuments", args.replacementForId)
      : null;
    if (args.replacementForId && replacement?.userId !== userId) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({ code: "RESUME_NOT_FOUND" });
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    const type = metadata?.contentType ?? args.mimeType;
    const extension = args.fileName.toLocaleLowerCase("en-US").split(".").pop();
    if (!metadata) throw new ConvexError({ code: "FILE_NOT_FOUND" });
    if (metadata.size > MAX_BYTES || args.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({ code: "FILE_TOO_LARGE" });
    }
    if (
      !SUPPORTED_TYPES.has(type) ||
      (extension !== "pdf" && extension !== "docx") ||
      (extension === "pdf" && type !== "application/pdf") ||
      (extension === "docx" &&
        type !==
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    ) {
      if (metadata) await ctx.storage.delete(args.storageId);
      throw new ConvexError({ code: "UNSUPPORTED_MIME" });
    }
    const fileName = args.fileName.normalize("NFKC").trim().slice(0, 180);
    if (!fileName) throw new ConvexError({ code: "UNSUPPORTED_RESUME" });
    const defaultName = fileName.replace(/\.(?:pdf|docx)$/iu, "");
    const displayName = (
      args.displayName ??
      replacement?.displayName ??
      defaultName
    )
      .normalize("NFKC")
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, 80);
    const note = (args.note ?? replacement?.note ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, 300);
    const now = Date.now();
    const id = await ctx.db.insert("resumeDocuments", {
      userId,
      storageId: args.storageId,
      fileName,
      ...(displayName ? { displayName } : {}),
      ...(note ? { note } : {}),
      mimeType: type,
      size: metadata.size,
      activateOnSuccess,
      replacementForId: args.replacementForId,
      status: "processing",
      createdAt: now,
      updatedAt: now,
    });
    const willActivate =
      !profile?.activeResumeId ||
      activateOnSuccess ||
      replacement?._id === profile.activeResumeId;
    if (profile && !profile.onboardingCompleted && willActivate) {
      // A new onboarding CV starts a fresh education draft. Clear the old
      // override at upload time so edits made during processing still win.
      await ctx.db.patch("candidateProfiles", profile._id, {
        manualOverrideFields: (profile.manualOverrideFields ?? []).filter(
          (field) => field !== "qualifications",
        ),
      });
    }
    await recordProductEvent(ctx, {
      userId,
      event: "resume_uploaded",
      occurredAt: now,
    });
    return id;
  },
});

const summaryValidator = v.object({
  id: v.id("resumeDocuments"),
  fileName: v.string(),
  displayName: v.string(),
  note: v.union(v.string(), v.null()),
  mimeType: v.string(),
  size: v.number(),
  isActive: v.boolean(),
  status: v.string(),
  currentTitle: v.union(v.string(), v.null()),
  professionalDomain: v.union(v.string(), v.null()),
  seniority: v.union(v.string(), v.null()),
  summary: v.union(v.string(), v.null()),
  totalExperienceYears: v.union(v.number(), v.null()),
  targetRoles: v.array(
    v.object({
      id: v.id("catalogItems"),
      labelEn: v.union(v.string(), v.null()),
      labelHe: v.union(v.string(), v.null()),
      isCustom: v.boolean(),
    }),
  ),
  skills: v.array(
    v.object({
      id: v.id("catalogItems"),
      labelEn: v.union(v.string(), v.null()),
      labelHe: v.union(v.string(), v.null()),
      isCustom: v.boolean(),
    }),
  ),
  location: v.union(
    v.null(),
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
  needsLocation: v.boolean(),
  failureCode: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function catalogOption(item: Doc<"catalogItems">) {
  return {
    id: item._id,
    labelEn: item.labelEn ?? null,
    labelHe: item.labelHe ?? null,
    isCustom: item.visibility === "private",
  };
}

async function summarizeResume(
  ctx: QueryCtx,
  resume: Doc<"resumeDocuments">,
  profile: Doc<"candidateProfiles"> | null,
  inferredActiveId?: Id<"resumeDocuments">,
) {
  const isActive = (profile?.activeResumeId ?? inferredActiveId) === resume._id;
  const effectiveLocation =
    isActive && profile?.manualOverrideFields?.includes("location")
      ? (profile.primaryLocation ?? null)
      : (resume.normalizedLocation ??
        (isActive ? profile?.primaryLocation : null) ??
        null);
  const selections = await Promise.all(
    [...(resume.targetJobTitleIds ?? []), ...(resume.skillIds ?? [])].map(
      (id) => ctx.db.get("catalogItems", id),
    ),
  );
  const items = selections.filter((item): item is Doc<"catalogItems"> =>
    Boolean(item),
  );
  return {
    id: resume._id,
    fileName: resume.fileName,
    displayName:
      resume.displayName ?? resume.fileName.replace(/\.(?:pdf|docx)$/iu, ""),
    note: resume.note ?? null,
    mimeType: resume.mimeType,
    size: resume.size,
    isActive,
    status: resume.status === "replaced" ? "ready" : resume.status,
    currentTitle: resume.currentTitle ?? null,
    professionalDomain: resume.professionalDomain ?? null,
    seniority: resume.seniority ?? null,
    summary: resume.summary ?? null,
    totalExperienceYears:
      resume.totalExperienceMonths === undefined
        ? null
        : Math.round((resume.totalExperienceMonths / 12) * 10) / 10,
    targetRoles: items
      .filter((item) => item.kind === "jobTitle")
      .map(catalogOption),
    skills: items.filter((item) => item.kind === "skill").map(catalogOption),
    location: effectiveLocation,
    needsLocation: !effectiveLocation,
    failureCode: resume.failureCode ?? null,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

export const getCurrent = query({
  args: {},
  returns: v.union(v.null(), summaryValidator),
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const profile = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const active = profile?.activeResumeId
      ? await ctx.db.get("resumeDocuments", profile.activeResumeId)
      : null;
    const resume =
      active?.userId === userId
        ? active
        : await ctx.db
            .query("resumeDocuments")
            .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
            .order("desc")
            .first();
    return resume
      ? await summarizeResume(ctx, resume, profile, resume._id)
      : null;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(
    summaryValidator.pick(
      "id",
      "fileName",
      "displayName",
      "note",
      "mimeType",
      "size",
      "isActive",
      "status",
      "failureCode",
      "createdAt",
      "updatedAt",
    ),
  ),
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const [profile, resumes] = await Promise.all([
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("resumeDocuments")
        .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
        .order("desc")
        .take(25),
    ]);
    const inferredActiveId =
      profile?.activeResumeId ??
      resumes.find((resume) =>
        ["ready", "needs_confirmation", "replaced"].includes(resume.status),
      )?._id;
    return resumes.map((resume) => ({
      id: resume._id,
      fileName: resume.fileName,
      displayName:
        resume.displayName ?? resume.fileName.replace(/\.(?:pdf|docx)$/iu, ""),
      note: resume.note ?? null,
      mimeType: resume.mimeType,
      size: resume.size,
      isActive: inferredActiveId === resume._id,
      status: resume.status === "replaced" ? "ready" : resume.status,
      failureCode: resume.failureCode ?? null,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    }));
  },
});

export const getOwnedForProcessing = internalQuery({
  args: {
    resumeId: v.id("resumeDocuments"),
    userId: v.id("users"),
    profileUpdate: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), schema.doc("resumeDocuments")),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get("resumeDocuments", args.resumeId);
    return resume?.userId === args.userId &&
      (args.profileUpdate
        ? ["ready", "needs_confirmation", "replaced"].includes(resume.status) &&
          Boolean(resume.extractedText?.trim())
        : resume.status === "processing")
      ? resume
      : null;
  },
});

export const saveExtractedText = internalMutation({
  args: {
    resumeId: v.id("resumeDocuments"),
    userId: v.id("users"),
    text: v.string(),
    finalize: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get("resumeDocuments", args.resumeId);
    if (resume?.userId !== args.userId)
      throw new ConvexError({ code: "RESUME_NOT_FOUND" });
    if (
      !args.text.trim() ||
      new TextEncoder().encode(args.text).byteLength > 400_000
    )
      throw new ConvexError({ code: "RESUME_TEXT_TOO_LARGE" });
    await ctx.db.patch("resumeDocuments", resume._id, {
      extractedText: args.text,
      ...(args.finalize
        ? { status: "ready" as const, processedAt: Date.now() }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getProfileUpdateDraft = query({
  args: { resumeId: v.id("resumeDocuments") },
  returns: currentProfileValidator,
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const [resume, view] = await Promise.all([
      ctx.db.get("resumeDocuments", args.resumeId),
      loadProfileView(ctx, userId, user),
    ]);
    if (
      resume?.userId !== userId ||
      !resume.structuredProfileJson ||
      !view.profile?.onboardingCompleted
    )
      throw new ConvexError({ code: "RESUME_NOT_READY" });
    const patch = activeResumePatch(
      resume,
      { ...view.profile, manualOverrideFields: ["location"] },
      view.profile.updatedAt,
    );
    const selections = await summarizeResume(ctx, resume, view.profile);
    return {
      ...view,
      profile: {
        ...view.profile,
        ...patch,
        experienceDomains: resume.domains ?? [],
      },
      selections: {
        targetJobTitles: selections.targetRoles,
        skills: selections.skills,
      },
    };
  },
});

const extractionCatalogItemValidator = v.object({
  kind: v.union(
    v.literal("jobTitle"),
    v.literal("skill"),
    v.literal("experienceDomain"),
  ),
  labelEn: v.union(v.string(), v.null()),
  labelHe: v.union(v.string(), v.null()),
  aliases: v.array(v.string()),
});

export const getCatalogForExtraction = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(extractionCatalogItemValidator),
  handler: async (ctx, args) => {
    const kinds = ["jobTitle", "skill", "experienceDomain"] as const;
    const groups = await Promise.all(
      kinds.flatMap((kind) => [
        ctx.db
          .query("catalogItems")
          .withIndex("by_kind_and_visibility_and_active_and_priority", (q) =>
            q.eq("kind", kind).eq("visibility", "public").eq("active", true),
          )
          .order("desc")
          .take(500),
        ctx.db
          .query("catalogItems")
          .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
            q.eq("ownerUserId", args.userId).eq("kind", kind),
          )
          .take(100),
      ]),
    );
    return groups
      .flat()
      .filter(
        (
          item,
        ): item is Doc<"catalogItems"> & {
          kind: "jobTitle" | "skill" | "experienceDomain";
        } => item.active && kinds.some((kind) => kind === item.kind),
      )
      .map((item) => ({
        kind: item.kind,
        labelEn: item.labelEn ?? null,
        labelHe: item.labelHe ?? null,
        aliases: item.aliases ?? [],
      }));
  },
});

export const recordProcessingDiagnostics = internalMutation({
  args: {
    resumeId: v.id("resumeDocuments"),
    userId: v.id("users"),
    diagnostics: processingDiagnosticsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get("resumeDocuments", args.resumeId);
    if (resume?.userId === args.userId)
      await ctx.db.patch("resumeDocuments", resume._id, {
        processingDiagnostics: args.diagnostics,
        updatedAt: Date.now(),
      });
    return null;
  },
});

function normalizedKey(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

async function upsertCatalog(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: "jobTitle" | "skill",
  label: string,
) {
  if (kind === "skill") return upsertSkillCatalogItem(ctx, userId, label);
  const clean = label
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, kind === "jobTitle" ? 80 : 50);
  if (!clean) return null;
  const key = normalizedKey(clean);
  const owned = await ctx.db
    .query("catalogItems")
    .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
      q.eq("ownerUserId", userId).eq("kind", kind).eq("normalizedKey", key),
    )
    .unique();
  if (owned) return owned._id;
  const publicItems = await ctx.db
    .query("catalogItems")
    .withIndex("by_kind_and_visibility_and_active_and_priority", (q) =>
      q.eq("kind", kind).eq("visibility", "public").eq("active", true),
    )
    .take(500);
  const publicMatch = publicItems.find((item) =>
    item.normalizedLabels.includes(key),
  );
  if (publicMatch) return publicMatch._id;
  const now = Date.now();
  return await ctx.db.insert("catalogItems", {
    kind,
    ...(/[\u0590-\u05ff]/u.test(clean)
      ? { labelHe: clean }
      : { labelEn: clean }),
    normalizedKey: key,
    normalizedLabels: [key],
    searchText: clean,
    visibility: "private",
    ownerUserId: userId,
    source: "user",
    priority: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

const locationValidator = v.union(
  v.null(),
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
);

export const completeProcessing = internalMutation({
  args: {
    resumeId: v.id("resumeDocuments"),
    userId: v.id("users"),
    extractedText: v.string(),
    draftOnly: v.optional(v.boolean()),
    structuredProfileJson: v.string(),
    currentTitle: v.union(v.string(), v.null()),
    professionalDomain: v.union(v.string(), v.null()),
    seniority: v.union(
      v.literal("entry"),
      v.literal("mid"),
      v.literal("senior"),
      v.literal("lead"),
      v.literal("executive"),
      v.literal("unknown"),
    ),
    summary: v.union(v.string(), v.null()),
    targetRoles: v.array(v.string()),
    skills: v.array(v.string()),
    normalizedLocation: locationValidator,
    totalExperienceMonths: v.number(),
    experienceEvidence: v.union(v.literal("known"), v.literal("unknown")),
    normalizedPastRoles: v.array(v.string()),
    domains: v.array(v.string()),
    experienceByDomain: v.array(
      v.object({ domain: v.string(), months: v.number() }),
    ),
    qualifications: candidateQualificationsValidator,
    languages: v.array(
      v.object({
        languageCode: v.string(),
        proficiency: v.union(
          v.literal("basic"),
          v.literal("conversational"),
          v.literal("professional"),
          v.literal("fluent"),
          v.literal("native"),
        ),
      }),
    ),
    confidence: v.object({
      currentTitle: v.string(),
      location: v.string(),
      dates: v.string(),
      targetRoles: v.string(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get("resumeDocuments", args.resumeId);
    if (
      !resume ||
      resume.userId !== args.userId ||
      (!args.draftOnly && resume.status !== "processing")
    )
      throw new ConvexError({ code: "RESUME_NOT_PROCESSING" });
    const user = await ctx.db.get("users", args.userId);
    if (!user?.email) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const targetJobTitleIds = (
      await Promise.all(
        args.targetRoles
          .slice(0, 5)
          .map((label) => upsertCatalog(ctx, args.userId, "jobTitle", label)),
      )
    ).filter((id): id is Id<"catalogItems"> => Boolean(id));
    const skillIds = (
      await Promise.all(
        args.skills
          .slice(0, 30)
          .map((label) => upsertCatalog(ctx, args.userId, "skill", label)),
      )
    ).filter((id): id is Id<"catalogItems"> => Boolean(id));
    if (!targetJobTitleIds.length || !skillIds.length)
      throw new ConvexError({ code: "INSUFFICIENT_RESUME_DATA" });
    const existing = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const replacement = resume.replacementForId
      ? await ctx.db.get("resumeDocuments", resume.replacementForId)
      : null;
    const shouldActivate =
      !args.draftOnly &&
      !existing?.onboardingCompleted &&
      resume.activateOnSuccess !== false &&
      (!existing?.activeResumeId ||
        resume.activateOnSuccess === true ||
        replacement?._id === existing.activeResumeId);
    const replacesActiveResume = Boolean(replacement && shouldActivate);
    const legacyOverrides =
      existing?.onboardingCompleted &&
      existing.profileSourceVersion === undefined
        ? [
            "targetJobTitles",
            "professionalSummary",
            "yearsOfExperience",
            "skills",
            "location",
            "workArrangements",
            "employmentTypes",
            "minimumMonthlySalaryIls",
            "languages",
          ]
        : [];
    const overrides = new Set(
      existing?.manualOverrideFields ?? legacyOverrides,
    );
    if (replacesActiveResume) {
      for (const field of [
        "targetJobTitles",
        "professionalSummary",
        "yearsOfExperience",
        "skills",
        "location",
        "languages",
        "seniority",
      ] as const) {
        overrides.delete(field);
      }
    }
    const now = Date.now();
    const qualifications = normalizeCandidateQualifications(
      args.qualifications,
    );
    await observeReferenceTerms(
      ctx,
      { key: `user:${args.userId}`, userId: args.userId },
      [
        ...args.skills.map((term) => ({ kind: "skill" as const, term })),
        ...qualifications.education.flatMap((item) =>
          [item.field, item.credential]
            .filter((term): term is string => Boolean(term))
            .map((term) => ({ kind: "education" as const, term })),
        ),
      ],
    );
    const usable = Boolean(args.normalizedLocation);
    const derived = {
      ...(!overrides.has("targetJobTitles") ? { targetJobTitleIds } : {}),
      ...(!overrides.has("professionalSummary")
        ? {
            professionalSummary: args.summary
              ? args.summary.length >= 40
                ? args.summary
                : `${args.summary} ${args.skills.slice(0, 6).join(" · ")}`.slice(
                    0,
                    1_200,
                  )
              : undefined,
          }
        : {}),
      ...(!overrides.has("yearsOfExperience")
        ? {
            yearsOfExperience: Math.min(
              60,
              Math.floor(args.totalExperienceMonths / 12),
            ),
          }
        : {}),
      ...(!overrides.has("skills") ? { skillIds } : {}),
      ...(!overrides.has("location") && args.normalizedLocation
        ? {
            primaryLocation: args.normalizedLocation,
            preferredPlaceIds: [args.normalizedLocation.placeId],
            locationRadiusKm: args.normalizedLocation.radiusKm,
          }
        : !overrides.has("location") && replacesActiveResume
          ? {
              primaryLocation: undefined,
              preferredPlaceIds: undefined,
              locationRadiusKm: undefined,
            }
          : {}),
      ...(!overrides.has("workArrangements") && !existing?.workArrangements
        ? {
            workArrangements: ["onsite", "hybrid", "remote"] as Array<
              "onsite" | "hybrid" | "remote"
            >,
          }
        : {}),
      ...(!overrides.has("employmentTypes") && !existing?.employmentTypes
        ? {
            employmentTypes: ["full-time", "part-time", "contract"] as Array<
              "full-time" | "part-time" | "contract"
            >,
          }
        : {}),
      ...(!overrides.has("languages") &&
      (args.languages.length || replacesActiveResume)
        ? { languages: args.languages }
        : {}),
      ...(!overrides.has("seniority") ? { seniority: args.seniority } : {}),
      ...(!overrides.has("qualifications") ? { qualifications } : {}),
      cvCareerProfile: {
        resumeId: resume._id,
        ...(args.currentTitle ? { currentTitle: args.currentTitle } : {}),
        normalizedPastRoles: args.normalizedPastRoles.slice(0, 30),
        seniority: args.seniority,
        domains: args.domains.slice(0, 20),
        coreSkills: args.skills.slice(0, 30),
        totalExperienceMonths: args.totalExperienceMonths,
        experienceEvidence: args.experienceEvidence,
        experienceByDomain: args.experienceByDomain.slice(0, 20),
        updatedAt: now,
      },
    };
    if (existing && shouldActivate) {
      await ctx.db.patch("candidateProfiles", existing._id, {
        ...derived,
        activeResumeId: resume._id,
        cvReviewPending: true,
        profileSourceVersion: (existing.profileSourceVersion ?? 0) + 1,
        manualOverrideFields: [
          ...overrides,
        ] as Doc<"candidateProfiles">["manualOverrideFields"],
        onboardingCompleted: existing.onboardingCompleted,
        onboardingStep: 1,
        updatedAt: now,
      });
    } else if (!existing && !args.draftOnly) {
      await ctx.db.insert("candidateProfiles", {
        userId: args.userId,
        email: user.email.toLocaleLowerCase("en-US"),
        googleDisplayName: user.name,
        profileImage: user.image,
        ...derived,
        activeResumeId: resume._id,
        cvReviewPending: true,
        profileSourceVersion: 1,
        manualOverrideFields: [],
        onboardingStep: 1,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch("resumeDocuments", resume._id, {
      status: args.draftOnly
        ? resume.status
        : usable
          ? "ready"
          : "needs_confirmation",
      extractedText: args.extractedText,
      structuredProfileJson: args.structuredProfileJson,
      currentTitle: args.currentTitle ?? undefined,
      professionalDomain: args.professionalDomain ?? undefined,
      seniority: args.seniority,
      summary: args.summary ?? undefined,
      targetJobTitleIds,
      skillIds,
      normalizedLocation: args.normalizedLocation ?? undefined,
      totalExperienceMonths: args.totalExperienceMonths,
      extractedExperienceEvidence: args.experienceEvidence,
      coreSkills: args.skills.slice(0, 30),
      normalizedPastRoles: args.normalizedPastRoles.slice(0, 30),
      domains: args.domains.slice(0, 20),
      experienceByDomain: args.experienceByDomain.slice(0, 20),
      extractedLanguages: args.languages,
      extractedQualifications: qualifications,
      confidence: args.confidence,
      activateOnSuccess: undefined,
      replacementForId: undefined,
      updatedAt: now,
      processedAt: now,
    });
    if (!args.draftOnly && replacement && replacement.userId === args.userId) {
      await ctx.storage.delete(replacement.storageId);
      await ctx.db.delete("resumeDocuments", replacement._id);
    }
    return null;
  },
});

// Explicit support repair for an unfinished review; never reruns paid extraction.
export const restoreOnboardingEducation = internalMutation({
  args: { userId: v.id("users"), expectedProfileUpdatedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (
      !profile?.activeResumeId ||
      profile.onboardingCompleted ||
      !profile.cvReviewPending ||
      profile.updatedAt !== args.expectedProfileUpdatedAt
    )
      return false;
    const resume = await ctx.db.get("resumeDocuments", profile.activeResumeId);
    if (
      resume?.userId !== args.userId ||
      !resume.extractedQualifications ||
      !["ready", "needs_confirmation"].includes(resume.status)
    )
      return false;
    await ctx.db.patch("candidateProfiles", profile._id, {
      qualifications: resume.extractedQualifications,
      manualOverrideFields: (profile.manualOverrideFields ?? []).filter(
        (field) => field !== "qualifications",
      ),
      profileSourceVersion: (profile.profileSourceVersion ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const failProcessing = internalMutation({
  args: {
    resumeId: v.id("resumeDocuments"),
    userId: v.id("users"),
    failureCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get("resumeDocuments", args.resumeId);
    if (resume?.userId === args.userId)
      await ctx.db.patch("resumeDocuments", resume._id, {
        status: "failed",
        failureCode: args.failureCode.slice(0, 100),
        updatedAt: Date.now(),
      });
    return null;
  },
});

function parsedCareerData(resume: Doc<"resumeDocuments">) {
  let parsed: {
    roles?: Array<{ normalizedTitle?: string; domain?: string | null }>;
    experienceByDomain?: Array<{ domain: string; months: number }>;
    languages?: Array<{ language?: string; proficiency?: string | null }>;
  } = {};
  try {
    parsed = resume.structuredProfileJson
      ? (JSON.parse(resume.structuredProfileJson) as typeof parsed)
      : {};
  } catch {
    parsed = {};
  }
  return {
    normalizedPastRoles:
      resume.normalizedPastRoles ??
      parsed.roles?.flatMap((role) =>
        role.normalizedTitle ? [role.normalizedTitle] : [],
      ) ??
      [],
    domains: resume.domains ?? [
      ...new Set(
        [
          resume.professionalDomain,
          ...(parsed.roles?.map((role) => role.domain) ?? []),
        ].filter((value): value is string => Boolean(value)),
      ),
    ],
    experienceByDomain:
      resume.experienceByDomain ?? parsed.experienceByDomain ?? [],
  };
}

function activeResumePatch(
  resume: Doc<"resumeDocuments">,
  profile: Doc<"candidateProfiles">,
  now: number,
) {
  const overrides = new Set(profile.manualOverrideFields ?? []);
  const career = parsedCareerData(resume);
  return {
    ...(!overrides.has("targetJobTitles") && resume.targetJobTitleIds?.length
      ? { targetJobTitleIds: resume.targetJobTitleIds }
      : {}),
    ...(!overrides.has("professionalSummary") && resume.summary
      ? { professionalSummary: resume.summary }
      : {}),
    ...(!overrides.has("yearsOfExperience") &&
    resume.totalExperienceMonths !== undefined
      ? {
          yearsOfExperience: Math.min(
            60,
            Math.floor(resume.totalExperienceMonths / 12),
          ),
        }
      : {}),
    ...(!overrides.has("skills") && resume.skillIds?.length
      ? { skillIds: resume.skillIds }
      : {}),
    ...(!overrides.has("location") && resume.normalizedLocation
      ? {
          primaryLocation: resume.normalizedLocation,
          preferredPlaceIds: [resume.normalizedLocation.placeId],
          locationRadiusKm: resume.normalizedLocation.radiusKm,
        }
      : {}),
    ...(!overrides.has("languages") && resume.extractedLanguages?.length
      ? { languages: resume.extractedLanguages }
      : {}),
    ...(!overrides.has("seniority") && resume.seniority
      ? { seniority: resume.seniority }
      : {}),
    ...(!overrides.has("qualifications")
      ? { qualifications: resume.extractedQualifications }
      : {}),
    activeResumeId: resume._id,
    cvCareerProfile: {
      resumeId: resume._id,
      ...(resume.currentTitle ? { currentTitle: resume.currentTitle } : {}),
      normalizedPastRoles: career.normalizedPastRoles.slice(0, 30),
      seniority: resume.seniority ?? "unknown",
      domains: career.domains.slice(0, 20),
      coreSkills: resume.coreSkills ?? [],
      totalExperienceMonths: resume.totalExperienceMonths ?? 0,
      experienceEvidence: resume.extractedExperienceEvidence,
      experienceByDomain: career.experienceByDomain.slice(0, 20),
      updatedAt: now,
    },
    cvReviewPending: false,
    profileSourceVersion: (profile.profileSourceVersion ?? 0) + 1,
    updatedAt: now,
  } satisfies Partial<Doc<"candidateProfiles">>;
}

export const updateMetadata = mutation({
  args: {
    resumeId: v.id("resumeDocuments"),
    displayName: v.string(),
    note: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const resume = await ctx.db.get("resumeDocuments", args.resumeId);
    if (resume?.userId !== userId)
      throw new ConvexError({ code: "RESUME_NOT_FOUND" });
    const displayName = args.displayName
      .normalize("NFKC")
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, 80);
    const note = (args.note ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, 300);
    if (!displayName) throw new ConvexError({ code: "INVALID_RESUME_NAME" });
    await ctx.db.patch("resumeDocuments", resume._id, {
      displayName,
      note: note || undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Selecting a default document never imports career data or preferences.
export const setActive = mutation({
  args: { resumeId: v.id("resumeDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const [resume, profile] = await Promise.all([
      ctx.db.get("resumeDocuments", args.resumeId),
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
    ]);
    if (
      resume?.userId !== userId ||
      !profile?.onboardingCompleted ||
      !resume.extractedText?.trim() ||
      !["ready", "needs_confirmation", "replaced"].includes(resume.status)
    )
      throw new ConvexError({ code: "RESUME_NOT_READY" });
    await ctx.db.patch("candidateProfiles", profile._id, {
      activeResumeId: resume._id,
    });
    return null;
  },
});

export const deleteResume = mutation({
  args: { resumeId: v.id("resumeDocuments") },
  returns: v.union(v.id("resumeDocuments"), v.null()),
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const [resume, profile] = await Promise.all([
      ctx.db.get("resumeDocuments", args.resumeId),
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
    ]);
    if (resume?.userId !== userId)
      throw new ConvexError({ code: "RESUME_NOT_FOUND" });
    const deletingSourceResume = profile?.activeResumeId === resume._id;
    if (profile && deletingSourceResume)
      await ctx.db.patch("candidateProfiles", profile._id, {
        // Document selection does not change the matching profile revision.
        activeResumeId: undefined,
      });
    await ctx.storage.delete(resume.storageId);
    await ctx.db.delete("resumeDocuments", resume._id);
    return null;
  },
});

export const finishReview = mutation({
  args: {
    targetJobTitleIds: v.array(v.id("catalogItems")),
    location: v.optional(locationValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const profile = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile?.activeResumeId)
      throw new ConvexError({ code: "NO_RESUME_PROFILE" });
    if (!args.targetJobTitleIds.length || args.targetJobTitleIds.length > 5)
      throw new ConvexError({ code: "INVALID_TARGET_ROLES" });
    for (const id of args.targetJobTitleIds) {
      const item = await ctx.db.get("catalogItems", id);
      if (
        !item ||
        item.kind !== "jobTitle" ||
        !item.active ||
        (item.visibility === "private" && item.ownerUserId !== userId)
      )
        throw new ConvexError({ code: "INVALID_TARGET_ROLES" });
    }
    const location =
      args.location === undefined ? profile.primaryLocation : args.location;
    if (!location) throw new ConvexError({ code: "LOCATION_REQUIRED" });
    const changedRoles =
      JSON.stringify(args.targetJobTitleIds) !==
      JSON.stringify(profile.targetJobTitleIds ?? []);
    const changedLocation = args.location !== undefined;
    const overrides = new Set(profile.manualOverrideFields ?? []);
    if (changedRoles) overrides.add("targetJobTitles");
    if (changedLocation) overrides.add("location");
    const now = Date.now();
    await ctx.db.patch("candidateProfiles", profile._id, {
      targetJobTitleIds: args.targetJobTitleIds,
      ...(args.location !== undefined
        ? {
            primaryLocation: location,
            preferredPlaceIds: [location.placeId],
            locationRadiusKm: location.radiusKm,
          }
        : {}),
      manualOverrideFields: [
        ...overrides,
      ] as Doc<"candidateProfiles">["manualOverrideFields"],
      cvReviewPending: false,
      onboardingCompleted: true,
      onboardingStep: 4,
      completedAt: profile.completedAt ?? now,
      updatedAt: now,
    });
    await cancelOnboardingReminders(ctx, userId);
    await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserPage, {
      userId,
      lifecycleStatus: "verified_active",
      cursor: null,
      expectedProfileRevision: now,
    });
    await ctx.scheduler.runAfter(0, internal.dailyDiscovery.enqueueUser, {
      userId,
    });
    return null;
  },
});

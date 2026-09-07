import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { env, internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeJob, normalizePublicUrl } from "./jobDiscoveryModel";

const ACTIVE_URL = "https://example.com/jobs/worky-quality-active";
const BOARD_URL = "https://jobs.example.org/positions/worky-quality-active";
const CLOSED_URL = "https://example.com/jobs/worky-quality-closed";

const seedResult = v.object({
  userId: v.id("users"),
  activeJobId: v.id("jobs"),
  closedJobId: v.id("jobs"),
});

async function seedForUser(ctx: MutationCtx, userId: Id<"users">) {
  if (env.DEV_TOOLS_ENABLED !== "true") {
    throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
  }
  const profile = await ctx.db
    .query("candidateProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile?.primaryLocation || !profile.targetJobTitleIds?.length) {
    throw new ConvexError({ code: "NO_COMPLETED_PROFILE" });
  }
  const title = await ctx.db.get("catalogItems", profile.targetJobTitleIds[0]);
  if (!title) throw new ConvexError({ code: "TARGET_TITLE_NOT_FOUND" });
  const titleLabel = title.labelEn ?? title.labelHe;
  if (!titleLabel) throw new ConvexError({ code: "TARGET_TITLE_NOT_FOUND" });
  const workArrangement = profile.workArrangements?.[0] ?? "hybrid";
  const employmentType = profile.employmentTypes?.[0] ?? "full-time";
  const now = Date.now();
  const makeCandidate = (sourceUrl: string, closed: boolean) => ({
    title: titleLabel,
    companyName: closed ? "Worky Closed Fixture" : "Worky Quality Fixture Ltd.",
    sourceUrl,
    sourceName: closed ? "Closed Fixture" : "Worky Fixture Careers",
    sourceType: "employer" as const,
    descriptionText:
      "A deterministic quality fixture for testing clean canonical job results.",
    requirementsText:
      "Relevant professional experience and communication skills.",
    responsibilities: ["Deliver high-quality work"],
    requiredSkills: ["Communication", "Problem solving"],
    preferredSkills: [],
    requiredExperienceYearsMin: null,
    requiredExperienceYearsMax: null,
    educationRequirements: [],
    languages: [],
    country: profile.primaryLocation?.country ?? "Israel",
    city:
      profile.primaryLocation?.city ??
      profile.primaryLocation?.administrativeArea ??
      null,
    locationText: profile.primaryLocation?.formattedAddress ?? null,
    workArrangement,
    employmentType,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    postedAt: new Date(now).toISOString(),
    applicationDeadline: null,
    workAuthorizationRequirements: null,
    sourceEvidence: [{ url: sourceUrl, title: titleLabel, excerpt: null }],
  });
  const normalize = (sourceUrl: string, closed: boolean) => {
    const canonicalUrl = normalizePublicUrl(sourceUrl);
    if (!canonicalUrl) throw new ConvexError({ code: "INVALID_FIXTURE_URL" });
    const job = normalizeJob(
      makeCandidate(sourceUrl, closed),
      new Set([canonicalUrl]),
    );
    if (!job) throw new ConvexError({ code: "INVALID_FIXTURE_JOB" });
    return job;
  };
  const active = normalize(ACTIVE_URL, false);
  const closed = normalize(CLOSED_URL, true);

  const existingActive = await ctx.db
    .query("jobs")
    .withIndex("by_canonicalKey", (q) =>
      q.eq("canonicalKey", active.canonicalKey),
    )
    .first();
  const activeJobId =
    existingActive?._id ??
    (await ctx.db.insert("jobs", {
      ...active,
      firstDiscoveredAt: now,
      lastDiscoveredAt: now,
      lastVerifiedAt: now,
      activityStatus: "active",
      lifecycleStatus: "verified_active",
      activityReason: "development_fixture_active",
    }));
  if (existingActive) {
    await ctx.db.patch("jobs", activeJobId, {
      ...active,
      firstDiscoveredAt: existingActive.firstDiscoveredAt,
      lastDiscoveredAt: now,
      lastVerifiedAt: now,
      activityStatus: "active",
      lifecycleStatus: "verified_active",
      activityReason: "development_fixture_active",
      closedAt: undefined,
    });
  }

  const upsertActiveSource = async (args: {
    url: string;
    name: string;
    tier: "employer" | "job_board";
    providerKey: string;
    mergeReason?: string;
  }) => {
    const normalizedUrl = normalizePublicUrl(args.url);
    if (!normalizedUrl) throw new ConvexError({ code: "INVALID_FIXTURE_URL" });
    const existing = await ctx.db
      .query("jobSources")
      .withIndex("by_normalizedUrl", (q) =>
        q.eq("normalizedUrl", normalizedUrl),
      )
      .first();
    const values = {
      jobId: activeJobId,
      sourceName: args.name,
      sourceUrl: args.url,
      normalizedUrl,
      finalUrl: normalizedUrl,
      domain: new URL(normalizedUrl).hostname,
      sourceTier: args.tier,
      externalJobId: args.providerKey.split(":").slice(-1)[0],
      providerKey: args.providerKey,
      lastSeenAt: now,
      lastVerifiedAt: now,
      lastVerificationAttemptAt: now,
      nextVerificationAt: now + 3 * 24 * 60 * 60 * 1_000,
      verificationFailureCount: 0,
      activityStatus: "verified_active" as const,
      verificationMethod: "development_fixture",
      verificationEvidence: "Development fixture active source",
      duplicateReason: args.mergeReason,
      canonicalJobId: args.mergeReason ? activeJobId : undefined,
    };
    if (existing) {
      await ctx.db.patch("jobSources", existing._id, values);
      return existing._id;
    }
    const sourceId = await ctx.db.insert("jobSources", {
      ...values,
      firstSeenAt: now,
    });
    await ctx.db.insert("jobIngestionEvents", {
      jobId: activeJobId,
      sourceId,
      sourceUrl: args.url,
      providerKey: args.providerKey,
      contentHash: active.contentHash,
      rawProviderJson: active.rawProviderJson,
      mergeReason: args.mergeReason,
      observedAt: now,
    });
    return sourceId;
  };
  const employerSourceId = await upsertActiveSource({
    url: ACTIVE_URL,
    name: "Worky Fixture Careers",
    tier: "employer",
    providerKey: "example.com:worky-quality-active",
  });
  await upsertActiveSource({
    url: BOARD_URL,
    name: "Fixture Job Board",
    tier: "job_board",
    providerKey: "jobs.example.org:worky-quality-active",
    mergeReason: "canonical_company_title_location",
  });
  await ctx.db.patch("jobs", activeJobId, { bestSourceId: employerSourceId });
  const activeApplication = await ctx.db
    .query("jobApplications")
    .withIndex("by_userId_and_jobId", (q) =>
      q.eq("userId", profile.userId).eq("jobId", activeJobId),
    )
    .unique();
  if (activeApplication)
    await ctx.db.delete("jobApplications", activeApplication._id);

  const existingClosed = await ctx.db
    .query("jobs")
    .withIndex("by_canonicalKey", (q) =>
      q.eq("canonicalKey", closed.canonicalKey),
    )
    .first();
  const closedJobId =
    existingClosed?._id ??
    (await ctx.db.insert("jobs", {
      ...closed,
      firstDiscoveredAt: now,
      lastDiscoveredAt: now,
      lastVerifiedAt: now,
      closedAt: now,
      activityStatus: "inactive",
      lifecycleStatus: "closed",
      activityReason: "HTTP 410",
    }));
  if (existingClosed) {
    await ctx.db.patch("jobs", closedJobId, {
      lifecycleStatus: "closed",
      activityStatus: "inactive",
      activityReason: "HTTP 410",
      closedAt: existingClosed.closedAt ?? now,
    });
  }
  const application = await ctx.db
    .query("jobApplications")
    .withIndex("by_userId_and_jobId", (q) =>
      q.eq("userId", profile.userId).eq("jobId", closedJobId),
    )
    .unique();
  if (!application) {
    await ctx.db.insert("jobApplications", {
      userId: profile.userId,
      jobId: closedJobId,
      appliedAt: now,
      snapshot: {
        id: closedJobId,
        title: closed.title,
        companyName: closed.companyName,
        descriptionText: closed.descriptionText,
        requiredSkills: closed.requiredSkills,
        postedAt: closed.postedAt,
        unavailable: false,
        sourceUrl: CLOSED_URL,
        sourceName: closed.sourceName,
        sourceTier: "employer",
        locationText: closed.locationText,
        workArrangement: closed.workArrangement,
        salaryMin: closed.salaryMin,
        salaryMax: closed.salaryMax,
        salaryCurrency: closed.salaryCurrency,
        salaryPeriod: closed.salaryPeriod,
        discoveredAt: now,
        lastVerifiedAt: now,
        relevanceScore: 0,
        matchReasons: [],
        resultSource: "central",
      },
    });
  }
  return { userId: profile.userId, activeJobId, closedJobId };
}

export const seedForCurrentUser = mutation({
  args: {},
  returns: seedResult,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    return await seedForUser(ctx, userId);
  },
});

export const seedForLatestCompletedUser = internalMutation({
  args: {},
  returns: seedResult,
  handler: async (ctx) => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    const profile = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_onboardingCompleted", (q) =>
        q.eq("onboardingCompleted", true),
      )
      .order("desc")
      .first();
    if (!profile) throw new ConvexError({ code: "NO_COMPLETED_PROFILE" });
    return await seedForUser(ctx, profile.userId);
  },
});

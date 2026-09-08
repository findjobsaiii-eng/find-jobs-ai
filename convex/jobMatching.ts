import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { evaluateJobQuality, isDisplayEligibleJob } from "./jobQuality";
import type { SearchProfile } from "./jobDiscoveryModel";

const lifecycleValidator = v.union(
  v.literal("verified_active"),
  v.literal("probably_active"),
);

async function loadProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ profile: SearchProfile; revision: number } | null> {
  const stored = await ctx.db
    .query("candidateProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (
    !stored?.onboardingCompleted ||
    !stored.primaryLocation ||
    !stored.targetJobTitleIds?.length
  )
    return null;
  const [titles, skills] = await Promise.all([
    Promise.all(
      stored.targetJobTitleIds.map((id) => ctx.db.get("catalogItems", id)),
    ),
    Promise.all(
      (stored.skillIds ?? []).map((id) => ctx.db.get("catalogItems", id)),
    ),
  ]);
  const visibleLabel = (item: Doc<"catalogItems"> | null) =>
    item?.active &&
    (item.visibility === "public" || item.ownerUserId === userId)
      ? (item.labelEn ?? item.labelHe)
      : undefined;
  const targetJobTitles = titles
    .map(visibleLabel)
    .filter((x): x is string => Boolean(x));
  if (!targetJobTitles.length) return null;
  return {
    revision: stored.updatedAt,
    profile: {
      targetJobTitles,
      skills: skills.map(visibleLabel).filter((x): x is string => Boolean(x)),
      yearsOfExperience: stored.yearsOfExperience ?? 0,
      location: stored.primaryLocation,
      workArrangements: stored.workArrangements?.length
        ? stored.workArrangements
        : ["onsite", "hybrid", "remote"],
      employmentTypes: stored.employmentTypes?.length
        ? stored.employmentTypes
        : ["full-time", "part-time", "contract"],
      languages: stored.languages ?? [],
      minimumMonthlySalaryIls: stored.minimumMonthlySalaryIls ?? 0,
      normalizedPastRoles: stored.cvCareerProfile?.normalizedPastRoles ?? [],
      currentRole: stored.cvCareerProfile?.currentTitle,
      seniority: stored.seniority,
      professionalDomains: stored.cvCareerProfile?.domains ?? [],
      experienceByDomain: stored.cvCareerProfile?.experienceByDomain ?? [],
    },
  };
}

/**
 * Materializes one bounded catalog page for a user. Chained pages cover both
 * active lifecycle partitions, so no request-time "newest N" window can hide
 * an older job that is still active.
 */
export const reconcileUserPage = internalMutation({
  args: {
    userId: v.id("users"),
    lifecycleStatus: lifecycleValidator,
    cursor: v.union(v.string(), v.null()),
    expectedProfileRevision: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await loadProfile(ctx, args.userId);
    if (!loaded) return null;
    if (
      args.expectedProfileRevision !== undefined &&
      args.expectedProfileRevision !== loaded.revision
    ) {
      // The profile changed while a sweep was running. Restart from the new
      // revision rather than mixing two preference sets.
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserPage, {
        userId: args.userId,
        lifecycleStatus: "verified_active",
        cursor: null,
        expectedProfileRevision: loaded.revision,
      });
      return null;
    }
    const page = await ctx.db
      .query("jobs")
      .withIndex("by_lifecycleStatus_and_lastVerifiedAt", (q) =>
        q.eq("lifecycleStatus", args.lifecycleStatus),
      )
      .paginate({ cursor: args.cursor, numItems: 32 });
    const now = Date.now();
    for (const job of page.page) {
      const quality = evaluateJobQuality(job, loaded.profile);
      const source = job.bestSourceId
        ? await ctx.db.get("jobSources", job.bestSourceId)
        : null;
      const application = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", job._id),
        )
        .unique();
      const displayEligible = Boolean(
        !application &&
        quality.outcome === "eligible" &&
        isDisplayEligibleJob(job) &&
        source?.activityStatus === "verified_active" &&
        source.finalUrl &&
        source.lastVerifiedAt,
      );
      const existing = await ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", job._id),
        )
        .unique();
      const values = {
        userId: args.userId,
        jobId: job._id,
        profileRevision: loaded.revision,
        displayEligible,
        outcome: quality.outcome,
        exclusionReasons: quality.exclusionReasons,
        relevanceScore: quality.relevanceScore,
        scoreComponents: quality.scoreComponents,
        matchReasons: quality.matchReasons,
        resultSource: "central" as const,
        evaluatedAt: now,
      };
      if (!displayEligible) {
        if (existing) await ctx.db.delete("jobMatches", existing._id);
      } else if (existing)
        await ctx.db.patch("jobMatches", existing._id, values);
      else await ctx.db.insert("jobMatches", values);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserPage, {
        userId: args.userId,
        lifecycleStatus: args.lifecycleStatus,
        cursor: page.continueCursor,
        expectedProfileRevision: loaded.revision,
      });
    } else if (args.lifecycleStatus === "verified_active") {
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserPage, {
        userId: args.userId,
        lifecycleStatus: "probably_active",
        cursor: null,
        expectedProfileRevision: loaded.revision,
      });
    }
    return null;
  },
});

/** One-off/backstop dispatcher for existing profiles when this materialized
 * index is first introduced. Normal operation uses incremental triggers. */
export const dispatchAllUsers = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_onboardingCompleted", (q) =>
        q.eq("onboardingCompleted", true),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 8 });
    for (const profile of profiles.page) {
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileUserPage, {
        userId: profile.userId,
        lifecycleStatus: "verified_active",
        cursor: null,
        expectedProfileRevision: profile.updatedAt,
      });
    }
    if (!profiles.isDone) {
      await ctx.scheduler.runAfter(0, internal.jobMatching.dispatchAllUsers, {
        cursor: profiles.continueCursor,
      });
    }
    return null;
  },
});

/** Incremental inverse reconciliation for one changed job. This is the common
 * path after ingestion/reverification: page through profiles once instead of
 * rescanning the catalog for every user. */
export const reconcileJobUsers = internalMutation({
  args: {
    jobId: v.id("jobs"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("jobs", args.jobId);
    if (!job) return null;
    const profiles = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_onboardingCompleted", (q) =>
        q.eq("onboardingCompleted", true),
      )
      .paginate({ cursor: args.cursor, numItems: 12 });
    const source = job.bestSourceId
      ? await ctx.db.get("jobSources", job.bestSourceId)
      : null;
    const now = Date.now();
    for (const storedProfile of profiles.page) {
      const loaded = await loadProfile(ctx, storedProfile.userId);
      if (!loaded) continue;
      const quality = evaluateJobQuality(job, loaded.profile);
      const application = await ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", storedProfile.userId).eq("jobId", job._id),
        )
        .unique();
      const displayEligible = Boolean(
        !application &&
        quality.outcome === "eligible" &&
        isDisplayEligibleJob(job) &&
        source?.activityStatus === "verified_active" &&
        source.finalUrl &&
        source.lastVerifiedAt,
      );
      const existing = await ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", storedProfile.userId).eq("jobId", job._id),
        )
        .unique();
      const values = {
        userId: storedProfile.userId,
        jobId: job._id,
        profileRevision: loaded.revision,
        displayEligible,
        outcome: quality.outcome,
        exclusionReasons: quality.exclusionReasons,
        relevanceScore: quality.relevanceScore,
        scoreComponents: quality.scoreComponents,
        matchReasons: quality.matchReasons,
        resultSource: "central" as const,
        evaluatedAt: now,
      };
      if (!displayEligible) {
        if (existing) await ctx.db.delete("jobMatches", existing._id);
      } else if (existing)
        await ctx.db.patch("jobMatches", existing._id, values);
      else await ctx.db.insert("jobMatches", values);
    }
    if (!profiles.isDone) {
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileJobUsers, {
        jobId: args.jobId,
        cursor: profiles.continueCursor,
      });
    }
    return null;
  },
});

export const reconcileUserJob = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [loaded, job] = await Promise.all([
      loadProfile(ctx, args.userId),
      ctx.db.get("jobs", args.jobId),
    ]);
    if (!loaded || !job) return null;
    const [source, application, existing] = await Promise.all([
      job.bestSourceId ? ctx.db.get("jobSources", job.bestSourceId) : null,
      ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", job._id),
        )
        .unique(),
      ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", job._id),
        )
        .unique(),
    ]);
    const quality = evaluateJobQuality(job, loaded.profile);
    const displayEligible = Boolean(
      !application &&
      quality.outcome === "eligible" &&
      isDisplayEligibleJob(job) &&
      source?.activityStatus === "verified_active" &&
      source.finalUrl &&
      source.lastVerifiedAt,
    );
    if (!displayEligible) {
      if (existing) await ctx.db.delete("jobMatches", existing._id);
      return null;
    }
    const values = {
      userId: args.userId,
      jobId: job._id,
      profileRevision: loaded.revision,
      displayEligible: true,
      outcome: quality.outcome,
      exclusionReasons: quality.exclusionReasons,
      relevanceScore: quality.relevanceScore,
      scoreComponents: quality.scoreComponents,
      matchReasons: quality.matchReasons,
      resultSource: "central" as const,
      evaluatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch("jobMatches", existing._id, values);
    else await ctx.db.insert("jobMatches", values);
    return null;
  },
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildMatchAudit, loadSearchProfile } from "./jobDiscovery";
import { evaluateJobQuality, isDisplayEligibleJob } from "./jobQuality";
import { evaluateSuggestionFreshness } from "./jobFreshness";
import { isFreshActiveSource } from "./jobActivityPolicy";
import { isUserFacingJobSource } from "./jobSourceProvenance";
import {
  normalizePublicUrl,
  resolveExperienceRequirement,
} from "./jobDiscoveryModel";

const userSummary = v.object({
  userId: v.id("users"),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
});

const jobDiagnostic = v.object({
  jobId: v.id("jobs"),
  title: v.string(),
  companyName: v.string(),
  sourceUrl: v.string(),
  experience: v.object({
    storedMin: v.union(v.number(), v.null()),
    storedMax: v.union(v.number(), v.null()),
    resolvedMin: v.union(v.number(), v.null()),
    resolvedMax: v.union(v.number(), v.null()),
  }),
  normalizedJson: v.string(),
  providerJson: v.union(v.string(), v.null()),
});

function jobDiagnosticView(job: Doc<"jobs">) {
  const experience = resolveExperienceRequirement(job);
  const normalized = {
    title: job.title,
    companyName: job.companyName,
    requiredExperienceYearsMin: experience.min,
    requiredExperienceYearsMax: experience.max,
    storedRequiredExperienceYearsMin: job.requiredExperienceYearsMin,
    storedRequiredExperienceYearsMax: job.requiredExperienceYearsMax,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    responsibilities: job.responsibilities,
    educationRequirements: job.educationRequirements,
    languages: job.languages,
    country: job.country,
    city: job.city,
    locationText: job.locationText,
    workArrangement: job.workArrangement,
    employmentType: job.employmentType,
    requirementsText: job.requirementsText,
    descriptionText: job.descriptionText,
  };
  return {
    jobId: job._id,
    title: job.title,
    companyName: job.companyName,
    sourceUrl: normalizePublicUrl(job.sourceUrl) ?? job.sourceUrl,
    experience: {
      storedMin: job.requiredExperienceYearsMin,
      storedMax: job.requiredExperienceYearsMax,
      resolvedMin: experience.min,
      resolvedMax: experience.max,
    },
    normalizedJson: JSON.stringify(normalized, null, 2),
    providerJson: job.rawProviderJson ?? null,
  };
}

async function adminMembership(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const membership = await ctx.db
    .query("adminMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return membership?.active ? { userId, membership } : null;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const admin = await adminMembership(ctx);
  if (!admin) throw new ConvexError({ code: "ADMIN_REQUIRED" });
  return admin;
}

async function summarizeUser(ctx: QueryCtx, userId: Id<"users">) {
  const [user, profile] = await Promise.all([
    ctx.db.get("users", userId),
    ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  ]);
  return {
    userId,
    email: user?.email ?? profile?.email ?? null,
    name: profile?.preferredDisplayName ?? user?.name ?? null,
  };
}

export const getAccess = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    isAdmin: v.boolean(),
    user: v.union(userSummary, v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authenticated: false, isAdmin: false, user: null };
    const membership = await ctx.db
      .query("adminMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      authenticated: true,
      isAdmin: Boolean(membership?.active),
      user: await summarizeUser(ctx, userId),
    };
  },
});

export const grantAdminByEmail = internalMutation({
  args: { email: v.string(), grantedBy: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const email = args.email
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US");
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new ConvexError({ code: "USER_NOT_FOUND" });
    const existing = await ctx.db
      .query("adminMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("adminMemberships", existing._id, {
        active: true,
        grantedBy: args.grantedBy.slice(0, 200),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminMemberships", {
        userId: user._id,
        role: "admin",
        active: true,
        grantedBy: args.grantedBy.slice(0, 200),
        createdAt: now,
        updatedAt: now,
      });
    }
    return user._id;
  },
});

export const revokeAdminByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const email = args.email
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US");
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) return false;
    const existing = await ctx.db
      .query("adminMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!existing) return false;
    await ctx.db.patch("adminMemberships", existing._id, {
      active: false,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const overview = query({
  args: { dayKey: v.string(), start: v.number(), end: v.number() },
  returns: v.object({
    totalUsers: v.number(),
    newUsers: v.number(),
    scheduledUsers: v.number(),
    searchesAttempted: v.number(),
    searchesSkipped: v.number(),
    jobsFound: v.number(),
    jobsInserted: v.number(),
    matchesCreated: v.number(),
    failures: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = 1_001;
    const [users, newUsers, runs, audits, discoveries, jobs, matches] =
      await Promise.all([
        ctx.db.query("users").order("desc").take(limit),
        ctx.db
          .query("users")
          .withIndex("by_creation_time", (q) =>
            q.gte("_creationTime", args.start).lt("_creationTime", args.end),
          )
          .take(limit),
        ctx.db
          .query("jobSearchRuns")
          .withIndex("by_startedAt", (q) =>
            q.gte("startedAt", args.start).lt("startedAt", args.end),
          )
          .take(limit),
        ctx.db
          .query("dailyDiscoveryAudits")
          .withIndex("by_dayKey_and_status", (q) => q.eq("dayKey", args.dayKey))
          .take(limit),
        ctx.db
          .query("jobDiscoveries")
          .withIndex("by_discoveredAt", (q) =>
            q.gte("discoveredAt", args.start).lt("discoveredAt", args.end),
          )
          .take(limit),
        ctx.db
          .query("jobs")
          .withIndex("by_firstDiscoveredAt", (q) =>
            q
              .gte("firstDiscoveredAt", args.start)
              .lt("firstDiscoveredAt", args.end),
          )
          .take(limit),
        ctx.db
          .query("jobMatches")
          .withIndex("by_creation_time", (q) =>
            q.gte("_creationTime", args.start).lt("_creationTime", args.end),
          )
          .take(limit),
      ]);
    return {
      totalUsers: Math.min(users.length, 1_000),
      newUsers: Math.min(newUsers.length, 1_000),
      scheduledUsers: Math.min(audits.length, 1_000),
      searchesAttempted: Math.min(runs.length, 1_000),
      searchesSkipped: audits.filter((item) => item.status === "skipped")
        .length,
      jobsFound: new Set(discoveries.map((item) => item.jobId)).size,
      jobsInserted: Math.min(jobs.length, 1_000),
      matchesCreated: Math.min(matches.length, 1_000),
      failures:
        runs.filter((item) => item.status === "failed").length +
        audits.filter((item) => item.status === "failed").length,
      truncated: [
        users,
        newUsers,
        runs,
        audits,
        discoveries,
        jobs,
        matches,
      ].some((items) => items.length === limit),
    };
  },
});

const runSummary = v.object({
  runId: v.id("jobSearchRuns"),
  user: userSummary,
  status: v.string(),
  startedAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
  resultSource: v.union(v.string(), v.null()),
  manual: v.boolean(),
  acceptedCount: v.number(),
  insertedCount: v.number(),
  deduplicatedCount: v.number(),
  returnedCandidateCount: v.number(),
  errorCategory: v.union(v.string(), v.null()),
  generatedQueries: v.array(v.string()),
});

export const listSearches = query({
  args: { dayKey: v.string(), start: v.number(), end: v.number() },
  returns: v.object({
    runs: v.array(runSummary),
    scheduled: v.array(
      v.object({
        auditId: v.id("dailyDiscoveryAudits"),
        user: userSummary,
        status: v.string(),
        reason: v.union(v.string(), v.null()),
        attemptCount: v.number(),
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const [runs, audits] = await Promise.all([
      ctx.db
        .query("jobSearchRuns")
        .withIndex("by_startedAt", (q) =>
          q.gte("startedAt", args.start).lt("startedAt", args.end),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("dailyDiscoveryAudits")
        .withIndex("by_dayKey_and_status", (q) => q.eq("dayKey", args.dayKey))
        .take(250),
    ]);
    return {
      runs: await Promise.all(
        runs.map(async (run) => {
          const queryRecord = await ctx.db.get("jobSearchQueries", run.queryId);
          return {
            runId: run._id,
            user: await summarizeUser(ctx, run.userId),
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt ?? null,
            resultSource: run.resultSource ?? null,
            manual: run.manual ?? false,
            acceptedCount: run.acceptedCount,
            insertedCount: run.insertedCount,
            deduplicatedCount: run.deduplicatedCount,
            returnedCandidateCount: run.returnedCandidateCount,
            errorCategory: run.errorCategory ?? null,
            generatedQueries: queryRecord?.generatedQueries ?? [],
          };
        }),
      ),
      scheduled: await Promise.all(
        audits.map(async (audit) => ({
          auditId: audit._id,
          user: await summarizeUser(ctx, audit.userId),
          status: audit.status,
          reason: audit.reason ?? null,
          attemptCount: audit.attemptCount,
          updatedAt: audit.updatedAt,
        })),
      ),
    };
  },
});

export const listUsers = query({
  args: {},
  returns: v.array(
    v.object({
      user: userSummary,
      createdAt: v.number(),
      onboardingCompleted: v.boolean(),
      profileUpdatedAt: v.union(v.number(), v.null()),
      visibleJobs: v.number(),
      lastSearchAt: v.union(v.number(), v.null()),
      lastSearchStatus: v.union(v.string(), v.null()),
      isAdmin: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(200);
    return await Promise.all(
      users.map(async (user) => {
        const [profile, lastRun, membership] = await Promise.all([
          ctx.db
            .query("candidateProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .unique(),
          ctx.db
            .query("jobSearchRuns")
            .withIndex("by_userId_and_startedAt", (q) =>
              q.eq("userId", user._id),
            )
            .order("desc")
            .first(),
          ctx.db
            .query("adminMemberships")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .unique(),
        ]);
        const visibleJobs = profile
          ? await ctx.db
              .query("jobMatches")
              .withIndex(
                "by_userId_profileRevision_displayEligible_relevanceScore",
                (q) =>
                  q
                    .eq("userId", user._id)
                    .eq("profileRevision", profile.updatedAt)
                    .eq("displayEligible", true),
              )
              .take(101)
          : [];
        return {
          user: {
            userId: user._id,
            email: user.email ?? profile?.email ?? null,
            name: profile?.preferredDisplayName ?? user.name ?? null,
          },
          createdAt: user._creationTime,
          onboardingCompleted: profile?.onboardingCompleted ?? false,
          profileUpdatedAt: profile?.updatedAt ?? null,
          visibleJobs: Math.min(visibleJobs.length, 100),
          lastSearchAt: lastRun?.startedAt ?? null,
          lastSearchStatus: lastRun?.status ?? null,
          isAdmin: Boolean(membership?.active),
        };
      }),
    );
  },
});

export const recordUserView = mutation({
  args: { subjectUserId: v.id("users") },
  returns: v.id("adminAuditEvents"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!(await ctx.db.get("users", args.subjectUserId))) {
      throw new ConvexError({ code: "USER_NOT_FOUND" });
    }
    return await ctx.db.insert("adminAuditEvents", {
      actorAdminUserId: admin.userId,
      subjectUserId: args.subjectUserId,
      action: "user.read_only_view_started",
      detail:
        "Admin opened the diagnostic user view; no user mutation authority was granted.",
      createdAt: Date.now(),
    });
  },
});

export const getUserInsight = query({
  args: { userId: v.id("users") },
  returns: v.object({
    user: userSummary,
    profile: v.object({
      completed: v.boolean(),
      updatedAt: v.union(v.number(), v.null()),
      location: v.union(v.string(), v.null()),
      radiusKm: v.union(v.number(), v.null()),
    }),
    counts: v.object({
      canonicalRealJobs: v.number(),
      activityEligible: v.number(),
      freshnessEligible: v.number(),
      insideLocation: v.number(),
      professionalEligible: v.number(),
      aboveThreshold: v.number(),
      displayed: v.number(),
    }),
    rejectionReasons: v.array(
      v.object({ reason: v.string(), count: v.number() }),
    ),
    visibleJobs: v.array(
      v.object({
        jobId: v.id("jobs"),
        title: v.string(),
        companyName: v.string(),
        relevanceScore: v.number(),
        matchQuality: v.union(v.string(), v.null()),
        requiredExperienceYearsMin: v.union(v.number(), v.null()),
        requiredExperienceYearsMax: v.union(v.number(), v.null()),
        requiredSkills: v.array(v.string()),
        locationText: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profileRecord = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profileRecord?.onboardingCompleted) {
      return {
        user: await summarizeUser(ctx, args.userId),
        profile: {
          completed: false,
          updatedAt: profileRecord?.updatedAt ?? null,
          location: null,
          radiusKm: null,
        },
        counts: {
          canonicalRealJobs: 0,
          activityEligible: 0,
          freshnessEligible: 0,
          insideLocation: 0,
          professionalEligible: 0,
          aboveThreshold: 0,
          displayed: 0,
        },
        rejectionReasons: [{ reason: "profile_incomplete", count: 1 }],
        visibleJobs: [],
      };
    }
    const audit = await buildMatchAudit(ctx, args.userId);
    const matches = await ctx.db
      .query("jobMatches")
      .withIndex(
        "by_userId_profileRevision_displayEligible_relevanceScore",
        (q) =>
          q
            .eq("userId", args.userId)
            .eq("profileRevision", profileRecord.updatedAt)
            .eq("displayEligible", true),
      )
      .order("desc")
      .take(50);
    const visibleJobs = [];
    for (const match of matches) {
      const job = await ctx.db.get("jobs", match.jobId);
      if (!job) continue;
      const experience = resolveExperienceRequirement(job);
      visibleJobs.push({
        jobId: job._id,
        title: job.title,
        companyName: job.companyName,
        relevanceScore: match.relevanceScore,
        matchQuality: match.matchQuality ?? null,
        requiredExperienceYearsMin: experience.min,
        requiredExperienceYearsMax: experience.max,
        requiredSkills: job.requiredSkills.slice(0, 8),
        locationText: job.locationText,
      });
    }
    return {
      user: await summarizeUser(ctx, args.userId),
      profile: {
        completed: true,
        updatedAt: profileRecord.updatedAt,
        location: profileRecord.primaryLocation?.formattedAddress ?? null,
        radiusKm: profileRecord.primaryLocation?.radiusKm ?? null,
      },
      counts: {
        canonicalRealJobs: audit.counts.canonicalRealJobs,
        activityEligible: audit.counts.activityEligible,
        freshnessEligible: audit.counts.freshnessEligible,
        insideLocation: audit.counts.insideLocation,
        professionalEligible: audit.counts.professionalEligible,
        aboveThreshold: audit.counts.aboveThreshold,
        displayed: audit.counts.displayed,
      },
      rejectionReasons: audit.rejectionReasons.slice(0, 12),
      visibleJobs,
    };
  },
});

export const listJobs = query({
  args: {},
  returns: v.array(
    v.object({
      jobId: v.id("jobs"),
      title: v.string(),
      companyName: v.string(),
      lifecycleStatus: v.string(),
      activityStatus: v.string(),
      firstDiscoveredAt: v.number(),
      lastDiscoveredAt: v.number(),
      postedAt: v.union(v.string(), v.null()),
      sourceUrl: v.string(),
      requiredExperienceYearsMin: v.union(v.number(), v.null()),
      requiredExperienceYearsMax: v.union(v.number(), v.null()),
      requiredSkills: v.array(v.string()),
      locationText: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_firstDiscoveredAt")
      .order("desc")
      .take(200);
    return jobs.map((job) => {
      const experience = resolveExperienceRequirement(job);
      return {
        jobId: job._id,
        title: job.title,
        companyName: job.companyName,
        lifecycleStatus: job.lifecycleStatus ?? "unknown",
        activityStatus: job.activityStatus,
        firstDiscoveredAt: job.firstDiscoveredAt,
        lastDiscoveredAt: job.lastDiscoveredAt,
        postedAt: job.postedAt,
        sourceUrl: normalizePublicUrl(job.sourceUrl) ?? job.sourceUrl,
        requiredExperienceYearsMin: experience.min,
        requiredExperienceYearsMax: experience.max,
        requiredSkills: job.requiredSkills.slice(0, 8),
        locationText: job.locationText,
      };
    });
  },
});

export const getJobDetail = query({
  args: { jobId: v.id("jobs") },
  returns: v.union(v.null(), jobDiagnostic),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get("jobs", args.jobId);
    return job ? jobDiagnosticView(job) : null;
  },
});

export const getSearchDetail = query({
  args: { runId: v.id("jobSearchRuns") },
  returns: v.union(
    v.null(),
    v.object({
      run: runSummary,
      normalizedCriteria: v.string(),
      providerDiagnostics: v.union(
        v.null(),
        v.object({
          responseStatus: v.string(),
          parsed: v.boolean(),
          incompleteReason: v.union(v.string(), v.null()),
          errorCode: v.union(v.string(), v.null()),
          errorMessage: v.union(v.string(), v.null()),
        }),
      ),
      jobs: v.array(
        v.object({
          jobId: v.id("jobs"),
          title: v.string(),
          companyName: v.string(),
          reused: v.boolean(),
          discoveredAt: v.number(),
          relevanceScore: v.union(v.number(), v.null()),
          outcome: v.union(v.string(), v.null()),
          exclusionReasons: v.array(v.string()),
          requiredExperienceYearsMin: v.union(v.number(), v.null()),
          requiredExperienceYearsMax: v.union(v.number(), v.null()),
          requiredSkills: v.array(v.string()),
          locationText: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    if (!run) return null;
    const [queryRecord, discoveries, matches] = await Promise.all([
      ctx.db.get("jobSearchQueries", run.queryId),
      ctx.db
        .query("jobDiscoveries")
        .withIndex("by_searchRunId", (q) => q.eq("searchRunId", run._id))
        .take(100),
      ctx.db
        .query("jobMatches")
        .withIndex("by_searchRunId", (q) => q.eq("searchRunId", run._id))
        .take(100),
    ]);
    const matchByJob = new Map(matches.map((match) => [match.jobId, match]));
    const jobs = [];
    for (const discovery of discoveries) {
      const job = await ctx.db.get("jobs", discovery.jobId);
      if (!job) continue;
      const match = matchByJob.get(job._id);
      const experience = resolveExperienceRequirement(job);
      jobs.push({
        jobId: job._id,
        title: job.title,
        companyName: job.companyName,
        reused: discovery.reused,
        discoveredAt: discovery.discoveredAt,
        relevanceScore: match?.relevanceScore ?? null,
        outcome: match?.outcome ?? null,
        exclusionReasons: match?.exclusionReasons ?? [],
        requiredExperienceYearsMin: experience.min,
        requiredExperienceYearsMax: experience.max,
        requiredSkills: job.requiredSkills.slice(0, 8),
        locationText: job.locationText,
      });
    }
    return {
      run: {
        runId: run._id,
        user: await summarizeUser(ctx, run.userId),
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt ?? null,
        resultSource: run.resultSource ?? null,
        manual: run.manual ?? false,
        acceptedCount: run.acceptedCount,
        insertedCount: run.insertedCount,
        deduplicatedCount: run.deduplicatedCount,
        returnedCandidateCount: run.returnedCandidateCount,
        errorCategory: run.errorCategory ?? null,
        generatedQueries: queryRecord?.generatedQueries ?? [],
      },
      normalizedCriteria: queryRecord?.normalizedCriteria ?? "",
      providerDiagnostics: run.providerDiagnostics
        ? {
            responseStatus: run.providerDiagnostics.responseStatus,
            parsed: run.providerDiagnostics.parsed,
            incompleteReason: run.providerDiagnostics.incompleteReason ?? null,
            errorCode: run.providerDiagnostics.errorCode ?? null,
            errorMessage: run.providerDiagnostics.errorMessage ?? null,
          }
        : null,
      jobs,
    };
  },
});

export const explainUserJob = query({
  args: { userId: v.id("users"), jobId: v.id("jobs"), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      user: userSummary,
      job: v.object({
        jobId: v.id("jobs"),
        title: v.string(),
        companyName: v.string(),
      }),
      visible: v.boolean(),
      headline: v.string(),
      relevanceScore: v.union(v.number(), v.null()),
      matchQuality: v.union(v.string(), v.null()),
      exclusionReasons: v.array(v.string()),
      matchReasons: v.array(v.string()),
      profileEvidence: v.union(
        v.null(),
        v.object({
          yearsOfExperience: v.number(),
          seniority: v.union(v.string(), v.null()),
          targetJobTitles: v.array(v.string()),
          skills: v.array(v.string()),
          location: v.string(),
        }),
      ),
      experience: v.object({
        candidateYears: v.union(v.number(), v.null()),
        storedMin: v.union(v.number(), v.null()),
        storedMax: v.union(v.number(), v.null()),
        resolvedMin: v.union(v.number(), v.null()),
        resolvedMax: v.union(v.number(), v.null()),
        eligible: v.union(v.boolean(), v.null()),
      }),
      checks: v.array(
        v.object({ key: v.string(), passed: v.boolean(), detail: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const [job, profileRecord, application, materialized] = await Promise.all([
      ctx.db.get("jobs", args.jobId),
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", args.jobId),
        )
        .unique(),
      ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", args.jobId),
        )
        .unique(),
    ]);
    if (!job) return null;
    const source = job.bestSourceId
      ? await ctx.db.get("jobSources", job.bestSourceId)
      : null;
    const experience = resolveExperienceRequirement(job);
    if (!profileRecord?.onboardingCompleted) {
      return {
        user: await summarizeUser(ctx, args.userId),
        job: { jobId: job._id, title: job.title, companyName: job.companyName },
        visible: false,
        headline: "The user has not completed a searchable profile.",
        relevanceScore: null,
        matchQuality: null,
        exclusionReasons: ["profile_incomplete"],
        matchReasons: [],
        profileEvidence: null,
        experience: {
          candidateYears: null,
          storedMin: job.requiredExperienceYearsMin,
          storedMax: job.requiredExperienceYearsMax,
          resolvedMin: experience.min,
          resolvedMax: experience.max,
          eligible: null,
        },
        checks: [
          {
            key: "profile",
            passed: false,
            detail: "Search profile is incomplete.",
          },
        ],
      };
    }
    const profile = await loadSearchProfile(ctx, args.userId);
    const experienceEligible =
      experience.min === null || profile.yearsOfExperience >= experience.min;
    const quality = evaluateJobQuality(job, profile);
    const freshness = evaluateSuggestionFreshness({
      postedAt: job.postedAt,
      lifecycleStatus: job.lifecycleStatus,
      relevanceScore: quality.relevanceScore,
      now: args.now,
    });
    const historyEligible =
      !application?.status || application.status === "saved";
    const jobEligible = isDisplayEligibleJob(job);
    const sourceEligible = Boolean(
      source &&
      isUserFacingJobSource(source) &&
      isFreshActiveSource(source, args.now) &&
      source.finalUrl &&
      source.lastVerifiedAt,
    );
    const materializedCurrent = Boolean(
      materialized?.displayEligible &&
      materialized.profileRevision === profileRecord.updatedAt,
    );
    const visible = Boolean(
      historyEligible &&
      quality.outcome === "eligible" &&
      freshness.eligible &&
      jobEligible &&
      sourceEligible &&
      materializedCurrent,
    );
    const checks = [
      {
        key: "profile",
        passed: true,
        detail: `Profile revision ${profileRecord.updatedAt}.`,
      },
      {
        key: "job_activity",
        passed: jobEligible,
        detail: jobEligible
          ? "Canonical job is active and displayable."
          : `Lifecycle is ${job.lifecycleStatus ?? "unknown"}.`,
      },
      {
        key: "source",
        passed: sourceEligible,
        detail: sourceEligible
          ? `Verified ${source?.sourceTier ?? "source"} link is available.`
          : "No fresh, user-facing, verified application source is available.",
      },
      {
        key: "freshness",
        passed: freshness.eligible,
        detail: freshness.eligible
          ? `Posting is ${freshness.bucket}.`
          : (freshness.reason ?? "Posting is not fresh enough."),
      },
      {
        key: "experience",
        passed: experienceEligible,
        detail:
          experience.min === null
            ? `Candidate has ${profile.yearsOfExperience} years; the job requirement is unknown.`
            : `Candidate has ${profile.yearsOfExperience} years; job requires at least ${experience.min}${experience.max !== null && experience.max !== experience.min ? `-${experience.max}` : ""} years.`,
      },
      {
        key: "profile_fit",
        passed: quality.outcome === "eligible",
        detail:
          quality.outcome === "eligible"
            ? `No hard conflict; relevance score ${quality.relevanceScore}.`
            : `Blocked by ${quality.exclusionReasons.join(", ")}.`,
      },
      {
        key: "history",
        passed: historyEligible,
        detail: historyEligible
          ? "Application history does not hide this suggestion."
          : `Tracking status ${application?.status ?? "unknown"} hides it from suggestions.`,
      },
      {
        key: "materialized_feed",
        passed: materializedCurrent,
        detail: materializedCurrent
          ? "A current visible match is materialized."
          : "No current visible match row exists; reconciliation may be pending or the job was excluded.",
      },
    ];
    const failed = checks.filter((check) => !check.passed);
    return {
      user: await summarizeUser(ctx, args.userId),
      job: { jobId: job._id, title: job.title, companyName: job.companyName },
      visible,
      headline: visible
        ? "This job is visible because every feed gate passes."
        : `This job is hidden by ${failed.map((check) => check.key).join(", ")}.`,
      relevanceScore: quality.relevanceScore,
      matchQuality: quality.matchQuality,
      exclusionReasons: [
        ...quality.exclusionReasons,
        ...(freshness.reason ? [freshness.reason] : []),
        ...(!historyEligible ? ["application_history"] : []),
      ],
      matchReasons: quality.matchReasons,
      profileEvidence: {
        yearsOfExperience: profile.yearsOfExperience,
        seniority: profile.seniority ?? null,
        targetJobTitles: profile.targetJobTitles,
        skills: profile.skills,
        location: profile.location.formattedAddress,
      },
      experience: {
        candidateYears: profile.yearsOfExperience,
        storedMin: job.requiredExperienceYearsMin,
        storedMax: job.requiredExperienceYearsMax,
        resolvedMin: experience.min,
        resolvedMax: experience.max,
        eligible: experienceEligible,
      },
      checks,
    };
  },
});

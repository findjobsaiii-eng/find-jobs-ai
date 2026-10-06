import { internal } from "./_generated/api";
import {
  overviewValidator,
  decisionMetricsValidator,
} from "./adminMetricsModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v, type Infer } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  jobFeedViewValidator,
  loadSearchProfile,
  loadSuggestionMatches,
  loadUserJobsFeed,
  userJobsFeedValidator,
} from "./jobDiscovery";
import { currentProfileValidator, loadProfileView } from "./candidateProfiles";
import {
  emailPreferenceValidator,
  loadEmailPreference,
} from "./emailPreferences";
import { evaluateJobQuality, isDisplayEligibleJob } from "./jobQuality";
import { evaluateSuggestionFreshness } from "./jobFreshness";
import { isDisplayEligibleSource } from "./jobActivityPolicy";
import { isUserFacingJobSource } from "./jobSourceProvenance";
import {
  normalizePublicUrl,
  resolveExperienceRequirement,
} from "./jobDiscoveryModel";
import { productEventValidator } from "./productAnalytics";
import { estimateOpenAiUsd } from "./aiUsageModel";

const DAY_MS = 24 * 60 * 60 * 1_000;
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
  returns: v.union(overviewValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db
      .query("adminMetricSnapshots")
      .withIndex("by_key", (q) => q.eq("key", args.dayKey))
      .unique();
    return snapshot?.overviewJson
      ? (JSON.parse(snapshot.overviewJson) as Infer<typeof overviewValidator>)
      : null;
  },
});
export const decisionMetrics = query({
  args: { now: v.number() },
  returns: v.union(decisionMetricsValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db
      .query("adminMetricSnapshots")
      .withIndex("by_end", (q) => q.eq("end", args.now))
      .first();
    return snapshot?.decisionJson
      ? (JSON.parse(snapshot.decisionJson) as Infer<
          typeof decisionMetricsValidator
        >)
      : null;
  },
});

export const requestMetrics = mutation({
  args: { dayKey: v.string(), start: v.number(), end: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(args.dayKey) ||
      args.end <= args.start ||
      args.end - args.start > 26 * 60 * 60_000
    )
      throw new ConvexError({ code: "INVALID_DATE_RANGE" });
    const previous = await ctx.db
      .query("adminMetricSnapshots")
      .withIndex("by_key", (q) => q.eq("key", args.dayKey))
      .unique();
    const now = Date.now();
    if (
      previous &&
      (previous.generatedAt > now - 5 * 60_000 ||
        (previous.refreshingAt ?? 0) > now - 10 * 60_000)
    )
      return null;
    if (previous)
      await ctx.db.patch("adminMetricSnapshots", previous._id, {
        refreshingAt: now,
      });
    else
      await ctx.db.insert("adminMetricSnapshots", {
        key: args.dayKey,
        start: args.start,
        end: args.end,
        generatedAt: 0,
        refreshingAt: now,
      });
    await ctx.scheduler.runAfter(0, internal.adminMetrics.refresh, args);
    return null;
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
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(
    v.object({
      user: userSummary,
      createdAt: v.number(),
      onboardingCompleted: v.boolean(),
      profileUpdatedAt: v.union(v.number(), v.null()),
      indexedMatches: v.number(),
      lastSearchAt: v.union(v.number(), v.null()),
      lastSearchStatus: v.union(v.string(), v.null()),
      lastSeenAt: v.union(v.number(), v.null()),
      lastMeaningfulActionAt: v.union(v.number(), v.null()),
      savedJobs: v.number(),
      isAdmin: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = args.search?.normalize("NFKC").trim().slice(0, 100);
    const opts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, 20),
    };
    const users = search
      ? await ctx.db
          .query("users")
          .withSearchIndex("search_name_email", (q) =>
            q.search("searchText", search),
          )
          .paginate(opts)
      : await ctx.db
          .query("users")
          .withIndex("by_creation_time")
          .order("desc")
          .paginate(opts);
    const page = await Promise.all(
      users.page.map(async (user) => {
        const [profile, lastRun, membership, activity, applications] =
          await Promise.all([
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
            ctx.db
              .query("userActivity")
              .withIndex("by_userId", (q) => q.eq("userId", user._id))
              .unique(),
            ctx.db
              .query("jobApplications")
              .withIndex("by_userId_and_jobId", (q) => q.eq("userId", user._id))
              .take(101),
          ]);
        // List summaries use persisted matches; only the selected user runs
        // exact feed validation. Never reload the identity catalog per row.
        const partitions = profile?.onboardingCompleted
          ? await Promise.all(
              (["strong", "partial"] as const).map((quality) =>
                ctx.db
                  .query("jobMatches")
                  .withIndex("by_user_revision_eligible_quality_score", (q) =>
                    q
                      .eq("userId", user._id)
                      .eq("profileRevision", profile.updatedAt)
                      .eq("displayEligible", true)
                      .eq("matchQuality", quality),
                  )
                  .order("desc")
                  .take(quality === "strong" ? 50 : 5),
              ),
            )
          : [[], []];
        const matches = partitions.flat();
        const tracked = new Set(
          applications
            .filter((a) => a.status && a.status !== "saved")
            .map((a) => a.jobId),
        );
        const strong = matches.filter(
          (m) => m.matchQuality === "strong" && !tracked.has(m.jobId),
        );
        const partial = matches.filter(
          (m) => m.matchQuality === "partial" && !tracked.has(m.jobId),
        );
        return {
          user: {
            userId: user._id,
            email: user.email ?? profile?.email ?? null,
            name: profile?.preferredDisplayName ?? user.name ?? null,
          },
          createdAt: user._creationTime,
          onboardingCompleted: profile?.onboardingCompleted ?? false,
          profileUpdatedAt: profile?.updatedAt ?? null,
          indexedMatches:
            strong.length >= 5
              ? strong.length
              : strong.length + Math.min(partial.length, 5 - strong.length),
          lastSearchAt: lastRun?.startedAt ?? null,
          lastSearchStatus: lastRun?.status ?? null,
          lastSeenAt: activity?.lastSeenAt ?? null,
          lastMeaningfulActionAt: activity?.lastMeaningfulActionAt ?? null,
          savedJobs: Math.min(
            applications.filter((application) => application.status === "saved")
              .length,
            100,
          ),
          isAdmin: Boolean(membership?.active),
        };
      }),
    );
    return { ...users, page };
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

export const getUserJobsPreview = query({
  args: {
    userId: v.id("users"),
    view: jobFeedViewValidator,
  },
  returns: v.union(
    v.null(),
    v.object({
      profile: currentProfileValidator,
      emailPreference: emailPreferenceValidator,
      feed: userJobsFeedValidator,
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;
    const [profile, emailPreference, feed] = await Promise.all([
      loadProfileView(ctx, args.userId, user),
      loadEmailPreference(ctx, args.userId),
      loadUserJobsFeed(ctx, args.userId, args.view),
    ]);
    return { profile, emailPreference, feed };
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
    activity: v.object({
      lastSeenAt: v.union(v.number(), v.null()),
      lastMeaningfulActionAt: v.union(v.number(), v.null()),
      recentEvents: v.array(
        v.object({
          event: productEventValidator,
          occurredAt: v.number(),
          jobId: v.union(v.id("jobs"), v.null()),
        }),
      ),
    }),
    email: v.object({
      sent: v.number(),
      delivered: v.number(),
      opened: v.number(),
      clicked: v.number(),
      bounced: v.number(),
      complained: v.number(),
      lastSentAt: v.union(v.number(), v.null()),
    }),
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
    const [profileRecord, activity, recentEvents, deliveries] =
      await Promise.all([
        ctx.db
          .query("candidateProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .unique(),
        ctx.db
          .query("userActivity")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .unique(),
        ctx.db
          .query("productEvents")
          .withIndex("by_userId_and_occurredAt", (q) =>
            q.eq("userId", args.userId),
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("emailDeliveries")
          .withIndex("by_userId_and_sentAt", (q) => q.eq("userId", args.userId))
          .order("desc")
          .take(100),
      ]);
    const activityView = {
      lastSeenAt: activity?.lastSeenAt ?? null,
      lastMeaningfulActionAt: activity?.lastMeaningfulActionAt ?? null,
      recentEvents: recentEvents.map((event) => ({
        event: event.event,
        occurredAt: event.occurredAt,
        jobId: event.jobId ?? null,
      })),
    };
    const emailView = {
      sent: deliveries.length,
      delivered: deliveries.filter((delivery) => delivery.deliveredAt).length,
      opened: deliveries.filter((delivery) => delivery.firstOpenedAt).length,
      clicked: deliveries.filter((delivery) => delivery.firstClickedAt).length,
      bounced: deliveries.filter((delivery) => delivery.bouncedAt).length,
      complained: deliveries.filter((delivery) => delivery.complainedAt).length,
      lastSentAt: deliveries[0]?.sentAt ?? null,
    };
    if (!profileRecord?.onboardingCompleted) {
      return {
        user: await summarizeUser(ctx, args.userId),
        profile: {
          completed: false,
          updatedAt: profileRecord?.updatedAt ?? null,
          location: null,
          radiusKm: null,
        },
        activity: activityView,
        email: emailView,
        visibleJobs: [],
      };
    }
    const matches = (
      await loadSuggestionMatches(ctx, args.userId, profileRecord.updatedAt)
    ).slice(0, 20);
    const visibleJobs = (
      await Promise.all(
        matches.map(async (match) => {
          const job = await ctx.db.get("jobs", match.jobId);
          if (!job) return null;
          const experience = resolveExperienceRequirement(job);
          return {
            jobId: job._id,
            title: job.title,
            companyName: job.companyName,
            relevanceScore: match.relevanceScore,
            matchQuality: match.matchQuality ?? null,
            requiredExperienceYearsMin: experience.min,
            requiredExperienceYearsMax: experience.max,
            requiredSkills: job.requiredSkills.slice(0, 8),
            locationText: job.locationText,
          };
        }),
      )
    ).filter((job) => job !== null);
    return {
      user: await summarizeUser(ctx, args.userId),
      profile: {
        completed: true,
        updatedAt: profileRecord.updatedAt,
        location: profileRecord.primaryLocation?.formattedAddress ?? null,
        radiusKm: profileRecord.primaryLocation?.radiusKm ?? null,
      },
      activity: activityView,
      email: emailView,
      visibleJobs,
    };
  },
});

const adminJobSummary = v.object({
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
});

function adminJobSummaryView(job: Doc<"jobs">) {
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
}

const usageOperation = v.union(
  v.literal("job_search"),
  v.literal("job_normalization"),
  v.literal("deep_review"),
  v.literal("resume_extraction"),
);
const usageRow = v.object({
  id: v.string(),
  operation: usageOperation,
  model: v.string(),
  startedAt: v.number(),
  requestCount: v.number(),
  inputTokens: v.union(v.number(), v.null()),
  cachedInputTokens: v.union(v.number(), v.null()),
  outputTokens: v.union(v.number(), v.null()),
  totalTokens: v.union(v.number(), v.null()),
  webSearchCalls: v.number(),
  estimatedUsd: v.union(v.number(), v.null()),
  historicalSearch: v.boolean(),
});
type UsageRow = typeof usageRow.type;

export const tokenUsage = query({
  args: { start: v.number(), end: v.number() },
  returns: v.object({
    rows: v.array(usageRow),
    truncated: v.boolean(),
    totals: v.array(
      v.object({
        operation: usageOperation,
        requests: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        webSearchCalls: v.number(),
        estimatedUsd: v.union(v.number(), v.null()),
        unpricedRequests: v.number(),
        unmeasuredRequests: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (
      !Number.isFinite(args.start) ||
      !Number.isFinite(args.end) ||
      args.end <= args.start ||
      args.end - args.start > 32 * DAY_MS
    ) {
      throw new ConvexError({ code: "INVALID_USAGE_RANGE" });
    }
    const [rawEvents, rawRuns] = await Promise.all([
      ctx.db
        .query("aiUsageEvents")
        .withIndex("by_createdAt", (q) =>
          q.gte("createdAt", args.start).lt("createdAt", args.end),
        )
        .order("desc")
        .take(501),
      ctx.db
        .query("jobSearchRuns")
        .withIndex("by_startedAt", (q) =>
          q.gte("startedAt", args.start).lt("startedAt", args.end),
        )
        .order("desc")
        .take(501),
    ]);
    const events = rawEvents.slice(0, 500);
    const runs = rawRuns.slice(0, 500);
    const rowsById = new Map<string, UsageRow>();
    const meteredRunIds = new Set<string>();
    for (const event of events) {
      const key = event.searchRunId
        ? `run:${event.searchRunId}`
        : `response:${event.responseId}`;
      if (event.searchRunId) meteredRunIds.add(event.searchRunId);
      const previous = rowsById.get(key);
      if (previous) {
        previous.requestCount += 1;
        previous.inputTokens =
          previous.inputTokens === null || event.inputTokens === null
            ? null
            : previous.inputTokens + event.inputTokens;
        previous.cachedInputTokens =
          previous.cachedInputTokens === null ||
          event.cachedInputTokens === null
            ? null
            : previous.cachedInputTokens + event.cachedInputTokens;
        previous.outputTokens =
          previous.outputTokens === null || event.outputTokens === null
            ? null
            : previous.outputTokens + event.outputTokens;
        previous.totalTokens =
          previous.totalTokens === null || event.totalTokens === null
            ? null
            : previous.totalTokens + event.totalTokens;
        previous.webSearchCalls += event.webSearchCalls;
        previous.estimatedUsd =
          previous.estimatedUsd === null || event.estimatedUsd === null
            ? null
            : previous.estimatedUsd + event.estimatedUsd;
      } else {
        rowsById.set(key, {
          id: key,
          operation: event.operation,
          model: event.model,
          startedAt: event.createdAt,
          requestCount: 1,
          inputTokens: event.inputTokens,
          cachedInputTokens: event.cachedInputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.totalTokens,
          webSearchCalls: event.webSearchCalls,
          estimatedUsd: event.estimatedUsd,
          historicalSearch: false,
        });
      }
    }
    for (const run of runs) {
      if (meteredRunIds.has(run._id)) continue;
      const inputTokens = run.usage?.inputTokens ?? null;
      const outputTokens = run.usage?.outputTokens ?? null;
      const webSearchCalls = run.webSearchToolCallCount ?? 0;
      rowsById.set(`run:${run._id}`, {
        id: `run:${run._id}`,
        operation: "job_search",
        model: run.model,
        startedAt: run.startedAt,
        requestCount: run.usage ? 1 : 0,
        inputTokens,
        cachedInputTokens: null,
        outputTokens,
        totalTokens: run.usage?.totalTokens ?? null,
        webSearchCalls,
        estimatedUsd: estimateOpenAiUsd({
          model: run.model,
          inputTokens,
          cachedInputTokens: null,
          outputTokens,
          webSearchCalls,
        }),
        historicalSearch: true,
      });
    }
    const rows = [...rowsById.values()].sort(
      (left, right) => right.startedAt - left.startedAt,
    );
    const operations = [
      "job_search",
      "job_normalization",
      "deep_review",
      "resume_extraction",
    ] as const;
    const totals = operations.map((operation) => {
      const matching = rows.filter((row) => row.operation === operation);
      return {
        operation,
        requests: matching.reduce((sum, row) => sum + row.requestCount, 0),
        inputTokens: matching.reduce(
          (sum, row) => sum + (row.inputTokens ?? 0),
          0,
        ),
        outputTokens: matching.reduce(
          (sum, row) => sum + (row.outputTokens ?? 0),
          0,
        ),
        webSearchCalls: matching.reduce(
          (sum, row) => sum + row.webSearchCalls,
          0,
        ),
        estimatedUsd:
          matching.length === 0 ||
          matching.some((row) => row.estimatedUsd !== null)
            ? matching.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0)
            : null,
        unpricedRequests: matching.reduce(
          (sum, row) =>
            sum + (row.requestCount > 0 && row.estimatedUsd === null ? 1 : 0),
          0,
        ),
        unmeasuredRequests: matching.filter(
          (row) => row.inputTokens === null || row.outputTokens === null,
        ).length,
      };
    });
    return {
      rows,
      truncated: rawEvents.length > 500 || rawRuns.length > 500,
      totals,
    };
  },
});

export const listJobs = query({
  args: {},
  returns: v.array(adminJobSummary),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_firstDiscoveredAt")
      .order("desc")
      .take(200);
    return jobs.map(adminJobSummaryView);
  },
});

export const searchJobs = query({
  args: {
    search: v.string(),
    field: v.union(v.literal("title"), v.literal("companyName")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminJobSummary),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = args.search.trim().replace(/\s+/gu, " ");
    if (!search || search.length > 100) {
      throw new ConvexError({ code: "INVALID_JOB_SEARCH" });
    }
    const page =
      args.field === "title"
        ? await ctx.db
            .query("jobs")
            .withSearchIndex("search_title", (q) => q.search("title", search))
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("jobs")
            .withSearchIndex("search_companyName", (q) =>
              q.search("companyName", search),
            )
            .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(adminJobSummaryView) };
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
      isDisplayEligibleSource(source, args.now) &&
      source.normalizedUrl,
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

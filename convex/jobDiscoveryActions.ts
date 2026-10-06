"use node";

import { normalizeVerifiedRequirements } from "./jobRequirementActions";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction, env } from "./_generated/server";
import {
  buildSearchPlan,
  JOB_DISCOVERY_LIMITS,
  normalizeTitleIdentity,
  canonicalDiscoveryRole,
} from "./jobDiscoveryModel";
import { getJobSearchRuntimeConfig } from "./jobSearchRuntimeConfig";
import { verifyJobSources } from "./jobSourceVerification";
import { openAiResponseUsage } from "./aiUsageModel";
import {
  JobSearchProviderResponseError,
  searchJobsWithOpenAI,
  type JobSearchProviderDiagnostics,
} from "./openAIJobProvider";
import { classifyJobSource } from "./jobSourceQuality";
import { globalDayKey } from "./jobSearchPolicy";

const discoveryBucketValidator = v.union(
  v.null(),
  v.literal(0),
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
  v.literal(7),
  v.literal(8),
  v.literal(9),
);

const usageValidator = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
});
const resultValidator = v.object({
  status: v.union(v.literal("completed"), v.literal("reused")),
  resultSource: v.union(
    v.literal("fresh"),
    v.literal("cache"),
    v.literal("central"),
  ),
  plan: v.union(v.literal("free"), v.literal("pro"), v.literal("admin")),
  generatedQueryCount: v.number(),
  cacheUsed: v.boolean(),
  returnedCandidateCount: v.number(),
  acceptedCount: v.number(),
  rejectedCount: v.number(),
  insertedCount: v.number(),
  deduplicatedCount: v.number(),
  webSearchToolCallCount: v.number(),
  candidateUrls: v.array(v.string()),
  verification: v.object({
    verifiedActive: v.number(),
    unknown: v.number(),
    closed: v.number(),
    temporaryFailure: v.number(),
  }),
  candidateSources: v.array(
    v.object({
      url: v.string(),
      domain: v.string(),
      sourceTier: v.union(
        v.literal("employer"),
        v.literal("ats"),
        v.literal("job_board"),
        v.literal("aggregator"),
      ),
      sourceFamily: v.string(),
      activityStatus: v.string(),
    }),
  ),
  usage: usageValidator,
});

type DiscoveryResult = {
  status: "completed" | "reused";
  resultSource: "fresh" | "cache" | "central";
  plan: "free" | "pro" | "admin";
  generatedQueryCount: number;
  cacheUsed: boolean;
  returnedCandidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  insertedCount: number;
  deduplicatedCount: number;
  webSearchToolCallCount: number;
  candidateUrls: string[];
  verification: {
    verifiedActive: number;
    unknown: number;
    closed: number;
    temporaryFailure: number;
  };
  candidateSources: Array<{
    url: string;
    domain: string;
    sourceTier: "employer" | "ats" | "job_board" | "aggregator";
    sourceFamily: string;
    activityStatus: string;
  }>;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
};

function requireConfiguration(name: string, value: string | undefined) {
  if (!value?.trim()) {
    throw new ConvexError({
      code: "OPENAI_CONFIGURATION_ERROR",
      variable: name,
    });
  }
  return value.trim();
}

export function classifyProviderError(error: unknown) {
  if (
    error instanceof Error &&
    /(?:insufficient_quota|exceeded your current quota|no (?:remaining )?credits|out of credits|credit balance)/iu.test(
      error.message,
    )
  )
    return "provider_billing";
  if (error instanceof JobSearchProviderResponseError)
    return "provider_unparsed_response";
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return "provider_timeout";
  if (error instanceof OpenAI.APIConnectionError) return "provider_connection";
  if (error instanceof OpenAI.RateLimitError) return "provider_rate_limit";
  if (error instanceof OpenAI.AuthenticationError)
    return "provider_authentication";
  if (error instanceof OpenAI.BadRequestError) return "provider_request";
  return "provider_failure";
}

export function providerFailureDiagnostics(
  error: unknown,
): JobSearchProviderDiagnostics | undefined {
  if (error instanceof JobSearchProviderResponseError) return error.diagnostics;
  if (error instanceof OpenAI.OpenAIError) {
    return {
      responseStatus:
        error instanceof OpenAI.APIConnectionTimeoutError
          ? "timeout"
          : error instanceof OpenAI.APIConnectionError
            ? "connection_error"
            : "request_error",
      parsed: false,
      errorCode: error.name,
      errorMessage: error.message.slice(0, 12_000),
      rawResponseExcerpt: "",
    };
  }
  if (error instanceof Error)
    return {
      responseStatus: "pipeline_exception",
      parsed: false,
      errorCode: error.name,
      errorMessage: (error.stack || error.message).slice(0, 12_000),
      rawResponseExcerpt: "",
    };
  return undefined;
}

function convexErrorCode(error: unknown) {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as unknown;
  if (!data || typeof data !== "object" || !("code" in data)) return null;
  return typeof data.code === "string" ? data.code : null;
}

export function discoveryFailureReason(error: unknown): string {
  const code = convexErrorCode(error);
  if (code === "JOB_DISCOVERY_FAILED" && error instanceof ConvexError) {
    const data = error.data as unknown;
    if (
      data &&
      typeof data === "object" &&
      "category" in data &&
      typeof data.category === "string"
    ) {
      return data.category;
    }
  }
  return code ?? "UNKNOWN";
}

export const discoverJobsForCurrentUser = action({
  args: {},
  returns: resultValidator,
  handler: async (ctx): Promise<DiscoveryResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    return discoverForUser(ctx, userId, true);
  },
});

export const discoverJobsForUserDevelopment = internalAction({
  args: { userId: v.id("users") },
  returns: resultValidator,
  handler: async (ctx, args): Promise<DiscoveryResult> => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    return await discoverForUser(ctx, args.userId, true);
  },
});

export const discoverJobsForUserCachedDevelopment = internalAction({
  args: { userId: v.id("users") },
  returns: resultValidator,
  handler: async (ctx, args): Promise<DiscoveryResult> => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    // Uses the same shared Israel-day cache and quota claims as the scheduler.
    return await discoverForUser(ctx, args.userId, false);
  },
});

export const discoverRoleForUserDevelopment = internalAction({
  args: { userId: v.id("users"), role: v.string() },
  returns: resultValidator,
  handler: async (ctx, args): Promise<DiscoveryResult> => {
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    return await discoverForUser(ctx, args.userId, true, args.role);
  },
});

/** Support repair uses normal daily claims/budgets and sends no notifications. */
export const repairCoverageForUser = internalAction({
  args: { userId: v.id("users"), retryFailed: v.optional(v.boolean()) },
  returns: resultValidator,
  handler: async (ctx, args): Promise<DiscoveryResult> => {
    try {
      let retryRole: string | undefined;
      if (args.retryFailed) {
        const failed = await ctx.runQuery(
          internal.jobDiscovery.getLatestFailedRun,
          { userId: args.userId },
        );
        if (!failed)
          throw new ConvexError({ code: "FAILED_RUN_NOT_RETRYABLE" });
        const profile = await ctx.runQuery(
          internal.jobDiscovery.getCurrentSearchProfile,
          { userId: args.userId },
        );
        retryRole = buildSearchPlan(profile).queryPlans.find(
          (plan) => plan.fingerprint === failed.fingerprint,
        )?.role;
        if (
          !retryRole ||
          !(await ctx.runMutation(
            internal.dailyDiscovery.claimFailedCoverageRetry,
            { userId: args.userId, runId: failed._id },
          ))
        )
          throw new ConvexError({ code: "FAILED_RUN_NOT_RETRYABLE" });
      }
      const result = await discoverForUser(
        ctx,
        args.userId,
        false,
        retryRole,
        Boolean(retryRole),
      );
      const visible = await ctx.runQuery(
        internal.jobDiscovery.hasVisibleJobsForUser,
        { userId: args.userId },
      );
      await ctx.runMutation(internal.dailyDiscovery.finishAttempt, {
        userId: args.userId,
        outcome:
          result.generatedQueryCount === 0
            ? visible
              ? "reused"
              : "no_search"
            : result.acceptedCount === 0
              ? "completed_empty"
              : "completed",
      });
      return result;
    } catch (error) {
      if (convexErrorCode(error) !== "FAILED_RUN_NOT_RETRYABLE")
        await ctx.runMutation(internal.dailyDiscovery.finishAttempt, {
          userId: args.userId,
          outcome: discoveryFailureReason(error),
        });
      throw error;
    }
  },
});

async function discoverForUser(
  ctx: ActionCtx,
  userId: Id<"users">,
  manual = false,
  requestedRole?: string,
  skipDailyRoleClaim = false,
): Promise<DiscoveryResult> {
  const normalizationDeadline = Date.now() + 8 * 60_000;
  const plan = await ctx.runQuery(internal.jobDiscovery.getUserPlan, {
    userId,
    now: Date.now(),
  });
  const result: DiscoveryResult = {
    status: "reused",
    resultSource: "central",
    plan,
    generatedQueryCount: 0,
    cacheUsed: false,
    returnedCandidateCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    insertedCount: 0,
    deduplicatedCount: 0,
    webSearchToolCallCount: 0,
    candidateUrls: [],
    verification: {
      verifiedActive: 0,
      unknown: 0,
      closed: 0,
      temporaryFailure: 0,
    },
    candidateSources: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
  // Free users never require provider credentials, configuration, or network IO.
  if (plan === "free") return result;
  const profile = await ctx.runQuery(
    internal.jobDiscovery.getCurrentSearchProfile,
    { userId },
  );
  const runtime = getJobSearchRuntimeConfig();
  const model = requireConfiguration(
    "OPENAI_JOB_SEARCH_MODEL",
    env.OPENAI_JOB_SEARCH_MODEL,
  );
  if (!manual && !skipDailyRoleClaim) {
    const roles = profile.targetJobTitles.filter(
      (role, index, titles) =>
        titles.findIndex(
          (title) =>
            normalizeTitleIdentity(title) === normalizeTitleIdentity(role),
        ) === index,
    );
    const dailyRole: string | null = await ctx.runMutation(
      internal.dailyDiscovery.claimDailyRole,
      { userId, roles },
    );
    if (dailyRole === null) return result;
    requestedRole = dailyRole;
  }
  const allQueryPlans = buildSearchPlan(
    !manual && requestedRole
      ? { ...profile, targetJobTitles: [requestedRole] }
      : profile,
  ).queryPlans;
  const requestedIdentity = requestedRole
    ? normalizeTitleIdentity(canonicalDiscoveryRole(requestedRole))
    : null;
  const queryPlans = requestedIdentity
    ? allQueryPlans.filter(
        (queryPlan) =>
          normalizeTitleIdentity(queryPlan.role) === requestedIdentity,
      )
    : allQueryPlans;
  if (!queryPlans.length)
    throw new ConvexError({ code: "INCOMPLETE_SEARCH_PROFILE" });
  let lastProviderError: string | null = null;
  for (const queryPlan of queryPlans) {
    const searchQuery = queryPlan.generatedQuery;
    const begun = await ctx.runMutation(internal.jobDiscovery.beginSearch, {
      userId,
      fingerprint: queryPlan.fingerprint,
      normalizedCriteria: queryPlan.normalizedCriteria,
      generatedQueries: [searchQuery],
      model,
      runtime,
      manual,
    });
    if (!begun) continue;
    try {
      const apiKey = requireConfiguration("OPENAI_API_KEY", env.OPENAI_API_KEY);
      // The SDK retries transient connection, timeout, 408/409, 429, and 5xx
      // failures with bounded exponential backoff. Permanent failures still
      // fail immediately; the next daily slot advances to the next role.
      const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 90_000 });
      await ctx.runMutation(internal.jobDiscovery.markProviderStarted, {
        userId,
        runId: begun.runId,
        reservationId: begun.reservationId,
      });
      const provider = await searchJobsWithOpenAI(
        client,
        model,
        [searchQuery],
        {
          maxQueries: 1,
          maxAcceptedJobs: JOB_DISCOVERY_LIMITS.maxJobsPerQuery,
          maxOutputTokens: runtime.outputTokenLimit,
        },
        async (response) => {
          try {
            await ctx.runMutation(internal.aiUsage.recordResponse, {
              responseId: response.id,
              userId,
              operation: "job_search",
              model: response.model || model,
              searchRunId: begun.runId,
              ...openAiResponseUsage(response),
            });
          } catch (error) {
            console.error("ai_usage_record_failed", error);
          }
        },
      );
      const jobs = await verifyJobSources(provider.accepted);
      // Each batch has at most six postings; normalization is per job, not per matching user.
      for (const item of jobs) {
        // Leave evidence incomplete for later re-verification instead of
        // exceeding the action lifetime and stranding the daily reservation.
        if (Date.now() > normalizationDeadline) break;
        const stored = await ctx.runQuery(
          internal.jobActivity.getStoredJobForSource,
          {
            sourceUrl:
              item.verification.finalUrl ?? item.job.normalizedSourceUrl,
          },
        );
        const facts = await normalizeVerifiedRequirements(
          ctx,
          stored ?? item.job,
          item.verification,
          { userId, ...(stored ? { jobId: stored._id } : {}) },
        );
        if (facts) item.job = { ...item.job, ...facts };
      }
      result.candidateUrls = [
        ...new Set([...result.candidateUrls, ...provider.candidateUrls]),
      ];
      for (const candidate of jobs) {
        const status = candidate.verification.activityStatus;
        if (status === "verified_active")
          result.verification.verifiedActive += 1;
        else if (status === "unknown") result.verification.unknown += 1;
        else if (status === "inactive") result.verification.closed += 1;
        else result.verification.temporaryFailure += 1;
        result.candidateSources.push({
          url: candidate.job.sourceUrl,
          domain: candidate.verification.domain,
          sourceTier: candidate.verification.sourceTier,
          sourceFamily: classifyJobSource(candidate.verification.domain)
            .sourceFamily,
          activityStatus: status,
        });
      }
      const persisted = await ctx.runMutation(
        internal.jobDiscovery.completeSearch,
        {
          userId,
          runId: begun.runId,
          reservationId: begun.reservationId,
          returnedCandidateCount: provider.returnedCandidateCount,
          rejectedCount: provider.rejectedCount,
          webSearchToolCallCount: provider.webSearchToolCallCount,
          usage: provider.usage,
          providerDiagnostics: provider.diagnostics,
          jobs,
          profile,
        },
      );
      result.status = "completed";
      result.resultSource = "fresh";
      result.generatedQueryCount++;
      result.returnedCandidateCount += provider.returnedCandidateCount;
      result.acceptedCount += persisted.acceptedCount;
      result.rejectedCount += persisted.rejectedCount;
      result.insertedCount += persisted.insertedCount;
      result.deduplicatedCount += persisted.deduplicatedCount;
      result.webSearchToolCallCount += provider.webSearchToolCallCount;
      result.usage.inputTokens += provider.usage.inputTokens;
      result.usage.outputTokens += provider.usage.outputTokens;
      result.usage.totalTokens += provider.usage.totalTokens;
    } catch (error) {
      const category = classifyProviderError(error);
      await ctx.runMutation(internal.jobDiscovery.failSearch, {
        userId,
        runId: begun.runId,
        reservationId: begun.reservationId,
        errorCategory: category,
        providerDiagnostics: providerFailureDiagnostics(error),
      });
      if (convexErrorCode(error) === "OPENAI_CONFIGURATION_ERROR") throw error;
      lastProviderError = category;
    }
  }
  if (result.generatedQueryCount === 0 && lastProviderError) {
    throw new ConvexError({
      code: "JOB_DISCOVERY_FAILED",
      category: lastProviderError,
    });
  }
  return result;
}

export const runDailyBatch = internalAction({
  args: {
    userIds: v.array(v.id("users")),
    cursor: v.union(v.string(), v.null()),
    bucket: v.optional(discoveryBucketValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const userId of args.userIds) {
      let outcome = "completed";
      let shouldNotify = false;
      try {
        const result = await discoverForUser(ctx, userId);
        const hasVisibleJobs = await ctx.runQuery(
          internal.jobDiscovery.hasVisibleJobsForUser,
          { userId },
        );
        shouldNotify = hasVisibleJobs;
        if (result.generatedQueryCount === 0) {
          outcome = hasVisibleJobs ? "reused" : "no_search";
        } else if (result.acceptedCount === 0) {
          outcome = "completed_empty";
        }
      } catch (error) {
        // Keep one failed profile/provider from stopping the remaining candidates.
        outcome = discoveryFailureReason(error);
      }
      await ctx.runMutation(internal.dailyDiscovery.finishAttempt, {
        userId,
        outcome,
      });
      if (shouldNotify) {
        await ctx.scheduler.runAfter(
          0,
          internal.jobEmailActions.sendJobMatches,
          {
            userId,
            dayKey: globalDayKey(Date.now()),
          },
        );
      }
    }
    if (args.cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.dailyDiscovery.dispatch, {
        cursor: args.cursor,
        bucket: args.bucket,
      });
    }
    return null;
  },
});

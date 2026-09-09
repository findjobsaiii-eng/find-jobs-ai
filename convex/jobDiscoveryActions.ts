"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction, env } from "./_generated/server";
import { buildSearchPlan } from "./jobDiscoveryModel";
import { getJobSearchRuntimeConfig } from "./jobSearchRuntimeConfig";
import { verifyJobSources } from "./jobSourceVerification";
import { searchJobsWithOpenAI } from "./openAIJobProvider";

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

function classifyProviderError(error: unknown) {
  if (error instanceof OpenAI.APIConnectionError) return "provider_connection";
  if (error instanceof OpenAI.RateLimitError) return "provider_rate_limit";
  if (error instanceof OpenAI.AuthenticationError)
    return "provider_authentication";
  if (error instanceof OpenAI.BadRequestError) return "provider_request";
  return "provider_failure";
}

function convexErrorCode(error: unknown) {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as unknown;
  if (!data || typeof data !== "object" || !("code" in data)) return null;
  return typeof data.code === "string" ? data.code : null;
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

async function discoverForUser(
  ctx: ActionCtx,
  userId: Id<"users">,
  manual = false,
): Promise<DiscoveryResult> {
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
  const queryPlans = buildSearchPlan(profile).queryPlans;
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
      const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
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
          maxAcceptedJobs: 10,
          maxOutputTokens: runtime.outputTokenLimit,
        },
      );
      const jobs = await verifyJobSources(provider.accepted);
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
      try {
        await discoverForUser(ctx, userId);
      } catch (error) {
        // Keep one failed profile/provider from stopping the remaining candidates.
        outcome = convexErrorCode(error) ?? "UNKNOWN";
      }
      await ctx.runMutation(internal.dailyDiscovery.finishAttempt, {
        userId,
        outcome,
      });
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

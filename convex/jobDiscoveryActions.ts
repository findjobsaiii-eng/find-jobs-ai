"use node";

import OpenAI from "openai";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, env } from "./_generated/server";
import { buildSearchPlan } from "./jobDiscoveryModel";
import { getJobSearchRuntimeConfig } from "./jobSearchRuntimeConfig";
import { verifyJobSources } from "./jobSourceVerification";
import { searchJobsWithOpenAI } from "./openAIJobProvider";

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
  handler: async (ctx: ActionCtx): Promise<DiscoveryResult> => {
    const profile = await ctx.runQuery(
      internal.jobDiscovery.getCurrentSearchProfile,
      {},
    );
    const runtime = getJobSearchRuntimeConfig();
    const model = requireConfiguration(
      "OPENAI_JOB_SEARCH_MODEL",
      env.OPENAI_JOB_SEARCH_MODEL,
    );
    const searchPlan = buildSearchPlan(profile);
    if (!searchPlan.generatedQueries.length) {
      throw new ConvexError({ code: "INCOMPLETE_SEARCH_PROFILE" });
    }
    const begun = await ctx.runMutation(internal.jobDiscovery.beginSearch, {
      fingerprint: searchPlan.fingerprint,
      normalizedCriteria: searchPlan.normalizedCriteria,
      generatedQueries: searchPlan.generatedQueries,
      model,
      profile,
      runtime,
    });
    if (begun.kind === "reused") {
      return {
        status: "reused",
        resultSource: begun.resultSource,
        plan: begun.plan,
        generatedQueryCount: 0,
        cacheUsed: begun.resultSource === "cache",
        returnedCandidateCount: 0,
        acceptedCount: begun.acceptedCount,
        rejectedCount: 0,
        insertedCount: 0,
        deduplicatedCount: begun.acceptedCount,
        webSearchToolCallCount: 0,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    try {
      const apiKey = requireConfiguration("OPENAI_API_KEY", env.OPENAI_API_KEY);
      const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
      await ctx.runMutation(internal.jobDiscovery.markProviderStarted, {
        runId: begun.runId,
        reservationId: begun.reservationId,
      });
      const provider = await searchJobsWithOpenAI(
        client,
        model,
        searchPlan.generatedQueries,
        {
          maxQueries: begun.maxQueries,
          maxAcceptedJobs: begun.maxAcceptedJobs,
          maxOutputTokens: runtime.outputTokenLimit,
        },
      );
      const verifiedJobs = await verifyJobSources(provider.accepted);
      const persisted = await ctx.runMutation(
        internal.jobDiscovery.completeSearch,
        {
          runId: begun.runId,
          reservationId: begun.reservationId,
          returnedCandidateCount: provider.returnedCandidateCount,
          rejectedCount: provider.rejectedCount,
          webSearchToolCallCount: provider.webSearchToolCallCount,
          usage: provider.usage,
          jobs: verifiedJobs,
          profile,
        },
      );
      return {
        status: "completed",
        resultSource: "fresh",
        plan: begun.plan,
        generatedQueryCount: begun.maxQueries,
        cacheUsed: false,
        returnedCandidateCount: provider.returnedCandidateCount,
        insertedCount: persisted.insertedCount,
        deduplicatedCount: persisted.deduplicatedCount,
        acceptedCount: persisted.acceptedCount,
        rejectedCount: persisted.rejectedCount,
        webSearchToolCallCount: provider.webSearchToolCallCount,
        usage: provider.usage,
      };
    } catch (error) {
      const errorCategory = classifyProviderError(error);
      await ctx.runMutation(internal.jobDiscovery.failSearch, {
        runId: begun.runId,
        reservationId: begun.reservationId,
        errorCategory,
      });
      if (convexErrorCode(error) === "OPENAI_CONFIGURATION_ERROR") {
        throw error;
      }
      throw new ConvexError({
        code: "JOB_DISCOVERY_FAILED",
        category: errorCategory,
      });
    }
  },
});

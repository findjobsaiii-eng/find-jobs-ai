"use node";

import OpenAI from "openai";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, env } from "./_generated/server";
import { buildSearchPlan } from "./jobDiscoveryModel";
import { searchJobsWithOpenAI } from "./openAIJobProvider";

const resultValidator = v.object({
  status: v.union(v.literal("completed"), v.literal("reused")),
  generatedQueryCount: v.number(),
  cacheUsed: v.boolean(),
  returnedCandidateCount: v.number(),
  acceptedCount: v.number(),
  rejectedCount: v.number(),
  insertedCount: v.number(),
  deduplicatedCount: v.number(),
  usage: v.object({
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
  }),
});

type DiscoveryResult = {
  status: "completed" | "reused";
  generatedQueryCount: number;
  cacheUsed: boolean;
  returnedCandidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  insertedCount: number;
  deduplicatedCount: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
};

type BeginResult =
  | { kind: "started"; runId: Id<"jobSearchRuns"> }
  | { kind: "reused"; runId: Id<"jobSearchRuns">; acceptedCount: number };

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

export const discoverJobsForCurrentUser = action({
  args: {},
  returns: resultValidator,
  handler: async (ctx: ActionCtx): Promise<DiscoveryResult> => {
    const profile = await ctx.runQuery(
      internal.jobDiscovery.getCurrentSearchProfile,
      {},
    );
    const apiKey = requireConfiguration("OPENAI_API_KEY", env.OPENAI_API_KEY);
    const model = requireConfiguration(
      "OPENAI_JOB_SEARCH_MODEL",
      env.OPENAI_JOB_SEARCH_MODEL,
    );
    const plan = buildSearchPlan(profile);
    if (!plan.generatedQueries.length) {
      throw new ConvexError({ code: "INCOMPLETE_SEARCH_PROFILE" });
    }
    const begun: BeginResult = await ctx.runMutation(
      internal.jobDiscovery.beginSearch,
      {
        fingerprint: plan.fingerprint,
        normalizedCriteria: plan.normalizedCriteria,
        generatedQueries: plan.generatedQueries,
        model,
      },
    );
    if (begun.kind === "reused") {
      return {
        status: "reused" as const,
        generatedQueryCount: plan.generatedQueries.length,
        cacheUsed: true,
        returnedCandidateCount: 0,
        acceptedCount: begun.acceptedCount,
        rejectedCount: 0,
        insertedCount: 0,
        deduplicatedCount: begun.acceptedCount,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
    try {
      const { accepted, returnedCandidateCount, rejectedCount, usage } =
        await searchJobsWithOpenAI(client, model, plan.generatedQueries);
      const persisted: {
        acceptedCount: number;
        insertedCount: number;
        deduplicatedCount: number;
      } = await ctx.runMutation(internal.jobDiscovery.completeSearch, {
        runId: begun.runId,
        returnedCandidateCount,
        rejectedCount,
        usage,
        jobs: accepted,
      });
      return {
        status: "completed" as const,
        generatedQueryCount: plan.generatedQueries.length,
        cacheUsed: false,
        returnedCandidateCount,
        rejectedCount,
        ...persisted,
        usage,
      };
    } catch (error) {
      const errorCategory = classifyProviderError(error);
      await ctx.runMutation(internal.jobDiscovery.failSearch, {
        runId: begun.runId,
        errorCategory,
      });
      throw new ConvexError({
        code: "JOB_DISCOVERY_FAILED",
        category: errorCategory,
      });
    }
  },
});

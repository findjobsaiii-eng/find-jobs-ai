import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { estimateOpenAiUsd } from "./aiUsageModel";

const nullableNumber = v.union(v.number(), v.null());

export const recordResponse = internalMutation({
  args: {
    responseId: v.string(),
    userId: v.id("users"),
    operation: v.union(
      v.literal("job_search"),
      v.literal("deep_review"),
      v.literal("resume_extraction"),
    ),
    model: v.string(),
    searchRunId: v.optional(v.id("jobSearchRuns")),
    jobId: v.optional(v.id("jobs")),
    resumeId: v.optional(v.id("resumeDocuments")),
    inputTokens: nullableNumber,
    cachedInputTokens: nullableNumber,
    outputTokens: nullableNumber,
    totalTokens: nullableNumber,
    webSearchCalls: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("aiUsageEvents")
      .withIndex("by_responseId", (q) => q.eq("responseId", args.responseId))
      .unique();
    if (existing) return null;
    await ctx.db.insert("aiUsageEvents", {
      ...args,
      estimatedUsd: estimateOpenAiUsd(args),
      createdAt: Date.now(),
    });
    return null;
  },
});

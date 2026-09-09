"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  verificationRateLimitKey,
  verifyJobSource,
} from "./jobSourceVerification";
import type { Doc, Id } from "./_generated/dataModel";

function createRateLimitedVerifier() {
  const providerTails = new Map<string, Promise<void>>();
  return async (job: Parameters<typeof verifyJobSource>[0]) => {
    const key = verificationRateLimitKey(job.sourceUrl);
    const previous = providerTails.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    providerTails.set(key, tail);
    await previous;
    try {
      return await verifyJobSource(job);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 750));
      release();
      if (providerTails.get(key) === tail) providerTails.delete(key);
    }
  };
}

export const verifyDueSources = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const claimed = await ctx.runMutation(
      internal.jobActivity.claimDueSources,
      {
        limit: 20,
      },
    );
    const verified: Array<{
      source: (typeof claimed)[number]["source"];
      verification: Awaited<ReturnType<typeof verifyJobSource>>;
    }> = [];
    const verifyRateLimited = createRateLimitedVerifier();
    let cursor = 0;
    async function worker() {
      while (cursor < claimed.length) {
        const index = cursor++;
        const { source, job } = claimed[index];
        verified[index] = {
          source,
          verification: await verifyRateLimited({
            title: job.title,
            companyName: job.companyName,
            sourceUrl: source.normalizedUrl,
            sourceType:
              source.sourceTier === "aggregator" ? "other" : source.sourceTier,
          }),
        };
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(3, claimed.length) }, () => worker()),
    );
    for (const { source, verification } of verified) {
      await ctx.runMutation(internal.jobActivity.recordVerification, {
        sourceId: source._id,
        verification,
      });
    }
    if (claimed.length === 20) {
      await ctx.scheduler.runAfter(
        60_000,
        internal.jobActivityActions.verifyDueSources,
        {},
      );
    }
    return null;
  },
});

export const reverifySpecificSources = internalAction({
  args: { sourceIds: v.array(v.id("jobSources")) },
  returns: v.array(
    v.object({
      sourceId: v.id("jobSources"),
      status: v.string(),
      evidence: v.string(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{ sourceId: Id<"jobSources">; status: string; evidence: string }>
  > => {
    const claimed: Array<{
      source: Doc<"jobSources">;
      job: Doc<"jobs">;
    }> = await ctx.runMutation(internal.jobActivity.claimSpecificSources, {
      sourceIds: args.sourceIds.slice(0, 10),
    });
    const verifyRateLimited = createRateLimitedVerifier();
    const results: Array<{
      sourceId: Id<"jobSources">;
      status: string;
      evidence: string;
    }> = [];
    for (const { source, job } of claimed) {
      const verification = await verifyRateLimited({
        title: job.title,
        companyName: job.companyName,
        sourceUrl: source.normalizedUrl,
        sourceType:
          source.sourceTier === "aggregator" ? "other" : source.sourceTier,
      });
      await ctx.runMutation(internal.jobActivity.recordVerification, {
        sourceId: source._id,
        verification,
      });
      results.push({
        sourceId: source._id,
        status: verification.activityStatus,
        evidence: verification.verificationEvidence,
      });
    }
    return results;
  },
});

export const reverifyVisibleCatalog = internalAction({
  args: { limit: v.number() },
  returns: v.object({
    eligibleBefore: v.number(),
    reEvaluated: v.number(),
    sourcesChecked: v.number(),
    eligible: v.number(),
    unknown: v.number(),
    closed: v.number(),
    expired: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    eligibleBefore: number;
    reEvaluated: number;
    sourcesChecked: number;
    eligible: number;
    unknown: number;
    closed: number;
    expired: number;
  }> => {
    const batch: {
      eligibleBefore: number;
      claimed: Array<{
        job: Doc<"jobs">;
        sources: Array<Doc<"jobSources">>;
      }>;
    } = await ctx.runMutation(
      internal.jobActivity.claimVisibleSourcesForEvidenceRecheck,
      { limit: args.limit },
    );
    const verifyRateLimited = createRateLimitedVerifier();
    let cursor = 0;
    let sourcesChecked = 0;
    async function worker() {
      while (cursor < batch.claimed.length) {
        const index = cursor++;
        const { job, sources } = batch.claimed[index];
        for (const source of sources) {
          const verification = await verifyRateLimited({
            title: job.title,
            companyName: job.companyName,
            sourceUrl: source.normalizedUrl,
            sourceType:
              source.sourceTier === "aggregator" ? "other" : source.sourceTier,
          });
          sourcesChecked += 1;
          await ctx.runMutation(internal.jobActivity.recordVerification, {
            sourceId: source._id,
            verification,
          });
          if (verification.activityStatus === "verified_active") break;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(3, batch.claimed.length) }, () => worker()),
    );
    const counts: {
      eligible: number;
      unknown: number;
      closed: number;
      expired: number;
    } = await ctx.runQuery(internal.jobActivity.getLifecycleCountsForJobs, {
      jobIds: batch.claimed.map(({ job }) => job._id),
    });
    return {
      eligibleBefore: batch.eligibleBefore,
      reEvaluated: batch.claimed.length,
      sourcesChecked,
      ...counts,
    };
  },
});

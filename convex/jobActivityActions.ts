"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyJobSource } from "./jobSourceVerification";
import type { Doc } from "./_generated/dataModel";

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
    let cursor = 0;
    async function worker() {
      while (cursor < claimed.length) {
        const index = cursor++;
        const { source, job } = claimed[index];
        verified[index] = {
          source,
          verification: await verifyJobSource({
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
    let cursor = 0;
    let sourcesChecked = 0;
    async function worker() {
      while (cursor < batch.claimed.length) {
        const index = cursor++;
        const { job, sources } = batch.claimed[index];
        for (const source of sources) {
          const verification = await verifyJobSource({
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

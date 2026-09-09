"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyJobSource } from "./jobSourceVerification";

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
    for (const { source, job } of claimed) {
      const verification = await verifyJobSource({
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

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { globalDayKey } from "./jobSearchPolicy";

// Scan bounded pages; workers run sequentially so a sweep cannot flood the provider.
export const dispatch = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const dayKey = globalDayKey(now);
    const profiles = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_onboardingCompleted", (q) =>
        q.eq("onboardingCompleted", true),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 5 });
    const userIds: Id<"users">[] = [];
    for (const profile of profiles.page) {
      const attempt = await ctx.db
        .query("dailyDiscoveryAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
        .unique();
      if (attempt?.dayKey === dayKey) continue;
      const entitlements = await ctx.db
        .query("userEntitlements")
        .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
        .order("desc")
        .take(10);
      const plan =
        entitlements.find(
          (item) =>
            item.active &&
            (item.expiresAt === undefined || item.expiresAt > now),
        )?.plan ?? "free";
      if (plan === "free") continue;
      const values = {
        userId: profile.userId,
        dayKey,
        lastAttemptAt: now,
        lastOutcome: "queued",
      };
      if (attempt)
        await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, values);
      else await ctx.db.insert("dailyDiscoveryAttempts", values);
      userIds.push(profile.userId);
    }
    const cursor = profiles.isDone ? null : profiles.continueCursor;
    if (userIds.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.jobDiscoveryActions.runDailyBatch,
        { userIds, cursor },
      );
    } else if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.dailyDiscovery.dispatch, {
        cursor,
      });
    }
    return null;
  },
});

export const finishAttempt = internalMutation({
  args: { userId: v.id("users"), outcome: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("dailyDiscoveryAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (attempt)
      await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, {
        lastOutcome: args.outcome.slice(0, 80),
      });
    return null;
  },
});

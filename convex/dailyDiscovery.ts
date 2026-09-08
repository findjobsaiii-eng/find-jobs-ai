import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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
type DiscoveryBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function discoveryBucket(userId: string) {
  let hash = 2166136261;
  for (const character of userId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10;
}

export function israelDiscoveryBucket(now: number): DiscoveryBucket | null {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 8 && hour <= 17 ? ((hour - 8) as DiscoveryBucket) : null;
}

async function activePaidPlan(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
) {
  const entitlements = await ctx.db
    .query("userEntitlements")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(10);
  return entitlements.find(
    (item) =>
      item.active && (item.expiresAt === undefined || item.expiresAt > now),
  )?.plan;
}

// Scan bounded pages; workers run sequentially so a sweep cannot flood the provider.
export const dispatch = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    bucket: v.optional(discoveryBucketValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const bucket =
      args.bucket === undefined ? israelDiscoveryBucket(now) : args.bucket;
    if (bucket === null && args.bucket === undefined) return null;
    const dayKey = globalDayKey(now);
    const profiles = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_onboardingCompleted", (q) =>
        q.eq("onboardingCompleted", true),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 5 });
    const userIds: Id<"users">[] = [];
    for (const profile of profiles.page) {
      if (bucket !== null && discoveryBucket(profile.userId) !== bucket)
        continue;
      const attempt = await ctx.db
        .query("dailyDiscoveryAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
        .unique();
      if (attempt?.dayKey === dayKey) continue;
      const plan = (await activePaidPlan(ctx, profile.userId, now)) ?? "free";
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
        { userIds, cursor, bucket },
      );
    } else if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.dailyDiscovery.dispatch, {
        cursor,
        bucket,
      });
    }
    return null;
  },
});

export const enqueueUser = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const [profile, attempt, plan] = await Promise.all([
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("dailyDiscoveryAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
      activePaidPlan(ctx, args.userId, now),
    ]);
    const dayKey = globalDayKey(now);
    if (
      !profile?.onboardingCompleted ||
      !plan ||
      plan === "free" ||
      attempt?.dayKey === dayKey
    )
      return null;
    const values = {
      userId: args.userId,
      dayKey,
      lastAttemptAt: now,
      lastOutcome: "queued",
    };
    if (attempt)
      await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, values);
    else await ctx.db.insert("dailyDiscoveryAttempts", values);
    await ctx.scheduler.runAfter(
      0,
      internal.jobDiscoveryActions.runDailyBatch,
      { userIds: [args.userId], cursor: null },
    );
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

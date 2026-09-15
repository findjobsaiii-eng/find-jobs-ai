import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { globalDayKey, resolveJobSearchPlan } from "./jobSearchPolicy";

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
const MAX_DAILY_DISCOVERY_ATTEMPTS = 3;
const EMPTY_DISCOVERY_RETRY_DELAY_MS = 15 * 60 * 1_000;

type DiscoveryAttempt = {
  dayKey?: string;
  nextAttemptAt?: number;
  attemptCount?: number;
  lastOutcome: string;
};

function canQueueAttempt(
  attempt: DiscoveryAttempt | null,
  dayKey: string,
  now: number,
  hasVisibleJobs: boolean,
) {
  if (!attempt || attempt.dayKey !== dayKey) return true;
  if (attempt.lastOutcome === "queued" || hasVisibleJobs) return false;
  if ((attempt.attemptCount ?? 1) >= MAX_DAILY_DISCOVERY_ATTEMPTS) return false;
  return attempt.nextAttemptAt === undefined || attempt.nextAttemptAt <= now;
}

async function hasVisibleJobs(
  ctx: MutationCtx,
  profile: { userId: Id<"users">; updatedAt: number },
) {
  return Boolean(
    await ctx.db
      .query("jobMatches")
      .withIndex(
        "by_userId_profileRevision_displayEligible_relevanceScore",
        (q) =>
          q
            .eq("userId", profile.userId)
            .eq("profileRevision", profile.updatedAt)
            .eq("displayEligible", true),
      )
      .first(),
  );
}

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
  return resolveJobSearchPlan(entitlements, now);
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
      const visible =
        attempt?.dayKey === dayKey ? await hasVisibleJobs(ctx, profile) : false;
      if (!canQueueAttempt(attempt, dayKey, now, visible)) continue;
      const plan = await activePaidPlan(ctx, profile.userId, now);
      if (plan === "free") continue;
      const values = {
        userId: profile.userId,
        dayKey,
        lastAttemptAt: now,
        lastOutcome: "queued",
        attemptCount:
          attempt?.dayKey === dayKey ? (attempt.attemptCount ?? 1) + 1 : 1,
        nextAttemptAt: undefined,
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
    if (!profile?.onboardingCompleted || !plan || plan === "free") return null;
    const visible =
      attempt?.dayKey === dayKey ? await hasVisibleJobs(ctx, profile) : false;
    if (!canQueueAttempt(attempt, dayKey, now, visible)) return null;
    const values = {
      userId: args.userId,
      dayKey,
      lastAttemptAt: now,
      lastOutcome: "queued",
      attemptCount:
        attempt?.dayKey === dayKey ? (attempt.attemptCount ?? 1) + 1 : 1,
      nextAttemptAt: undefined,
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
  args: {
    userId: v.id("users"),
    outcome: v.string(),
    retryable: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("dailyDiscoveryAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (attempt) {
      const attemptCount = attempt.attemptCount ?? 1;
      const shouldRetry =
        args.retryable && attemptCount < MAX_DAILY_DISCOVERY_ATTEMPTS;
      const now = Date.now();
      await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, {
        lastOutcome: args.outcome.slice(0, 80),
        nextAttemptAt: shouldRetry
          ? now + EMPTY_DISCOVERY_RETRY_DELAY_MS
          : undefined,
      });
      if (shouldRetry) {
        await ctx.scheduler.runAfter(
          EMPTY_DISCOVERY_RETRY_DELAY_MS,
          internal.dailyDiscovery.enqueueUser,
          { userId: args.userId },
        );
      }
    }
    return null;
  },
});

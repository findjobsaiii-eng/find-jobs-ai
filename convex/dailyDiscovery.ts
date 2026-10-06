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

type DailyDiscoveryStatus =
  "planned" | "queued" | "skipped" | "completed" | "failed";

async function recordDailyAudit(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    dayKey: string;
    status: DailyDiscoveryStatus;
    reason?: string;
    attemptCount: number;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("dailyDiscoveryAudits")
    .withIndex("by_userId_and_dayKey", (q) =>
      q.eq("userId", args.userId).eq("dayKey", args.dayKey),
    )
    .unique();
  const values = {
    status: args.status,
    reason: args.reason,
    attemptCount: args.attemptCount,
    updatedAt: args.now,
  };
  if (existing)
    await ctx.db.patch("dailyDiscoveryAudits", existing._id, values);
  else {
    await ctx.db.insert("dailyDiscoveryAudits", {
      userId: args.userId,
      dayKey: args.dayKey,
      plannedAt: args.now,
      ...values,
    });
  }
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
      // A repeat scheduler check must not overwrite the actual daily result.
      if (attempt?.dayKey === dayKey) continue;
      const plan = await activePaidPlan(ctx, profile.userId, now);
      if (plan === "free") {
        await recordDailyAudit(ctx, {
          userId: profile.userId,
          dayKey,
          status: "skipped",
          reason: "free_plan",
          attemptCount:
            attempt?.dayKey === dayKey ? (attempt.attemptCount ?? 0) : 0,
          now,
        });
        continue;
      }
      const attemptCount = 1;
      const values = {
        userId: profile.userId,
        dayKey,
        lastAttemptAt: now,
        lastOutcome: "queued",
        attemptCount,
      };
      if (attempt)
        await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, values);
      else await ctx.db.insert("dailyDiscoveryAttempts", values);
      await recordDailyAudit(ctx, {
        userId: profile.userId,
        dayKey,
        status: "queued",
        reason: "scheduled",
        attemptCount,
        now,
      });
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
    if (!profile?.onboardingCompleted) return null;
    if (attempt?.dayKey === dayKey) return null;
    if (!plan || plan === "free") {
      await recordDailyAudit(ctx, {
        userId: args.userId,
        dayKey,
        status: "skipped",
        reason: "free_plan",
        attemptCount:
          attempt?.dayKey === dayKey ? (attempt.attemptCount ?? 0) : 0,
        now,
      });
      return null;
    }
    const attemptCount = 1;
    const values = {
      userId: args.userId,
      dayKey,
      lastAttemptAt: now,
      lastOutcome: "queued",
      attemptCount,
    };
    if (attempt)
      await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, values);
    else await ctx.db.insert("dailyDiscoveryAttempts", values);
    await recordDailyAudit(ctx, {
      userId: args.userId,
      dayKey,
      status: "queued",
      reason: "scheduled",
      attemptCount,
      now,
    });
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("dailyDiscoveryAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (attempt) {
      const attemptCount = attempt.attemptCount ?? 1;
      const now = Date.now();
      await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, {
        lastOutcome: args.outcome.slice(0, 80),
      });
      const status: DailyDiscoveryStatus =
        args.outcome === "reused" || args.outcome === "no_search"
          ? "skipped"
          : args.outcome === "completed" || args.outcome === "completed_empty"
            ? "completed"
            : "failed";
      await recordDailyAudit(ctx, {
        userId: args.userId,
        dayKey: attempt.dayKey ?? globalDayKey(now),
        status,
        reason: args.outcome,
        attemptCount,
        now,
      });
    }
    return null;
  },
});

// Claim the role separately from queueing, so duplicate workers cannot spend twice.
export const claimDailyRole = internalMutation({
  args: { userId: v.id("users"), roles: v.array(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (!args.roles.length) return null;
    const attempt = await ctx.db
      .query("dailyDiscoveryAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    const dayKey = globalDayKey(now);
    if (attempt?.roleClaimDayKey === dayKey) return null;
    const index = (attempt?.nextRoleIndex ?? 0) % args.roles.length;
    const values = {
      roleClaimDayKey: dayKey,
      nextRoleIndex: (index + 1) % args.roles.length,
    };
    if (attempt)
      await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, {
        ...values,
        ...(attempt.dayKey !== dayKey
          ? {
              dayKey,
              lastAttemptAt: now,
              lastOutcome: "queued",
              attemptCount: 1,
            }
          : {}),
      });
    else
      await ctx.db.insert("dailyDiscoveryAttempts", {
        userId: args.userId,
        dayKey,
        attemptCount: 1,
        lastAttemptAt: now,
        lastOutcome: "queued",
        ...values,
      });
    return args.roles[index];
  },
});

/** One support retry per user/day, only after the latest non-manual run failed. */
export const claimFailedCoverageRetry = internalMutation({
  args: { userId: v.id("users"), runId: v.id("jobSearchRuns") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("jobSearchRuns", args.runId);
    const dayKey = globalDayKey(Date.now());
    const attempt = await ctx.db
      .query("dailyDiscoveryAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (
      !run ||
      run.userId !== args.userId ||
      run.manual ||
      run.status !== "failed" ||
      globalDayKey(run.startedAt) !== dayKey ||
      !attempt ||
      attempt.failureRetryDayKey === dayKey
    )
      return false;
    await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, {
      failureRetryDayKey: dayKey,
      dayKey,
      lastAttemptAt: Date.now(),
      lastOutcome: "queued",
      attemptCount:
        (attempt.dayKey === dayKey ? (attempt.attemptCount ?? 1) : 1) + 1,
    });
    return true;
  },
});

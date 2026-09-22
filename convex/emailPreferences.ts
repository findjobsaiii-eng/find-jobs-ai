import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const emailFrequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("never"),
);

const emailJobValidator = v.object({
  title: v.string(),
  companyName: v.string(),
  location: v.union(v.string(), v.null()),
  relevanceScore: v.number(),
});

const DEFAULT_FREQUENCY = "daily" as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const PENDING_TTL_MS = 30 * 60 * 1_000;

export const getMine = query({
  args: {},
  returns: v.object({ frequency: emailFrequencyValidator }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const preference = await ctx.db
      .query("emailPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return { frequency: preference?.frequency ?? DEFAULT_FREQUENCY };
  },
});

export const updateFrequency = mutation({
  args: { frequency: emailFrequencyValidator },
  returns: v.object({ frequency: emailFrequencyValidator }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const existing = await ctx.db
      .query("emailPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("emailPreferences", existing._id, {
        frequency: args.frequency,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("emailPreferences", {
        userId,
        frequency: args.frequency,
        updatedAt: now,
      });
    }
    return { frequency: args.frequency };
  },
});

export const prepareDelivery = internalMutation({
  args: {
    userId: v.id("users"),
    dayKey: v.string(),
    now: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      deliveryKey: v.string(),
      to: v.string(),
      displayName: v.union(v.string(), v.null()),
      jobs: v.array(emailJobValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const [user, profile, preference] = await Promise.all([
      ctx.db.get("users", args.userId),
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("emailPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
    ]);
    const frequency = preference?.frequency ?? DEFAULT_FREQUENCY;
    if (!user?.email || !profile?.onboardingCompleted || frequency === "never")
      return null;
    if (
      frequency === "weekly" &&
      preference?.lastSentAt !== undefined &&
      args.now - preference.lastSentAt < WEEK_MS
    )
      return null;

    const periodKey =
      frequency === "daily" ? `daily:${args.dayKey}` : `weekly:${args.dayKey}`;
    if (preference?.lastSentPeriodKey === periodKey) return null;
    if (
      preference?.lastStatus === "pending" &&
      preference.pendingAt !== undefined &&
      args.now - preference.pendingAt < PENDING_TTL_MS
    )
      return null;

    const matches = await ctx.db
      .query("jobMatches")
      .withIndex(
        "by_userId_profileRevision_displayEligible_relevanceScore",
        (q) =>
          q
            .eq("userId", args.userId)
            .eq("profileRevision", profile.updatedAt)
            .eq("displayEligible", true),
      )
      .order("desc")
      .take(5);
    const jobs = [];
    for (const match of matches) {
      const job = await ctx.db.get("jobs", match.jobId);
      if (!job) continue;
      jobs.push({
        title: job.title,
        companyName: job.companyName,
        location: job.locationText ?? job.city ?? null,
        relevanceScore: match.relevanceScore,
      });
    }
    if (jobs.length === 0) return null;

    const deliveryKey = `job-matches/${args.userId}/${periodKey}`;
    const state = {
      pendingDeliveryKey: deliveryKey,
      pendingAt: args.now,
      lastAttemptAt: args.now,
      lastStatus: "pending" as const,
      updatedAt: args.now,
    };
    if (preference)
      await ctx.db.patch("emailPreferences", preference._id, state);
    else
      await ctx.db.insert("emailPreferences", {
        userId: args.userId,
        frequency,
        ...state,
      });

    return {
      deliveryKey,
      to: user.email,
      displayName:
        profile.preferredDisplayName ?? profile.googleDisplayName ?? null,
      jobs,
    };
  },
});

export const finishDelivery = internalMutation({
  args: {
    userId: v.id("users"),
    deliveryKey: v.string(),
    sent: v.boolean(),
    resendEmailId: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const preference = await ctx.db
      .query("emailPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!preference || preference.pendingDeliveryKey !== args.deliveryKey)
      return null;
    const periodKey = args.deliveryKey.split("/").at(-1);
    await ctx.db.patch("emailPreferences", preference._id, {
      pendingDeliveryKey: undefined,
      pendingAt: undefined,
      lastStatus: args.sent ? "sent" : "failed",
      lastSentAt: args.sent ? args.now : preference.lastSentAt,
      lastSentPeriodKey:
        args.sent && periodKey ? periodKey : preference.lastSentPeriodKey,
      resendEmailId: args.resendEmailId,
      updatedAt: args.now,
    });
    return null;
  },
});

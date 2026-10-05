import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { buildOnboardingReminderEmail } from "./onboardingReminderTemplate";
import { requirePublicAppUrl } from "./jobEmailUrl";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  env,
} from "./_generated/server";

const HOUR = 60 * 60 * 1000;
export const RETRY_DELAY_MS = 10 * 60 * 1000;
const languageValidator = v.union(v.literal("en"), v.literal("he"));

export async function scheduleOnboardingReminders(
  ctx: MutationCtx,
  userId: Id<"users">,
  enrollment?: { cutoff: number; sendAfter: number },
) {
  const existing = await ctx.db
    .query("onboardingReminders")
    .withIndex("by_userId_and_phase", (q) => q.eq("userId", userId))
    .first();
  const user = await ctx.db.get("users", userId);
  if (existing || !user) return;
  for (const phase of ["24h", "72h"] as const) {
    // Historical accounts receive only the final reminder once both dates passed.
    if (
      enrollment &&
      phase === "24h" &&
      user._creationTime + 72 * HOUR <= enrollment.cutoff
    )
      continue;
    const originalDueAt =
      user._creationTime + (phase === "24h" ? 24 : 72) * HOUR;
    const dueAt = enrollment
      ? Math.max(originalDueAt, enrollment.sendAfter)
      : originalDueAt;
    const reminderId = await ctx.db.insert("onboardingReminders", {
      userId,
      phase,
      dueAt,
      language: "he",
      status: "pending",
      attempts: 0,
    });
    const scheduledId = await ctx.scheduler.runAt(
      dueAt,
      internal.onboardingReminderActions.send,
      { reminderId },
    );
    await ctx.db.patch("onboardingReminders", reminderId, { scheduledId });
  }
}

// Operator-only rollout. Stable cutoff + pagination bound reads; existing rows
// make rerunning a page safe, including after an interrupted CLI session.
export const enrollExistingPage = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    cutoff: v.number(),
    sendAfter: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    scanned: v.number(),
    eligible: v.number(),
    alreadyEnrolled: v.number(),
    excluded: v.number(),
    immediate: v.number(),
    future: v.number(),
    nextSendAfter: v.number(),
  }),
  handler: async (ctx, args) => {
    if (
      args.paginationOpts.numItems > 50 ||
      (args.paginationOpts.maximumRowsRead ?? 50) > 50
    )
      throw new ConvexError({ code: "BATCH_TOO_LARGE" });
    const page = await ctx.db
      .query("users")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", args.cutoff))
      .paginate(args.paginationOpts);
    let eligible = 0,
      alreadyEnrolled = 0,
      excluded = 0,
      immediate = 0,
      future = 0;
    let nextSendAfter = Math.max(args.sendAfter, Date.now());
    for (const user of page.page) {
      const [existing, profile, deletion, preference] = await Promise.all([
        ctx.db
          .query("onboardingReminders")
          .withIndex("by_userId_and_phase", (q) => q.eq("userId", user._id))
          .first(),
        ctx.db
          .query("candidateProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .unique(),
        ctx.db
          .query("accountDeletionJobs")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .unique(),
        ctx.db
          .query("emailPreferences")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .unique(),
      ]);
      if (existing) {
        alreadyEnrolled++;
        continue;
      }
      if (
        !user.email ||
        profile?.onboardingCompleted ||
        deletion ||
        preference?.frequency === "never"
      ) {
        excluded++;
        continue;
      }
      eligible++;
      const age = args.cutoff - user._creationTime;
      if (age >= 24 * HOUR) immediate++;
      future += age < 24 * HOUR ? 2 : age < 72 * HOUR ? 1 : 0;
      if (!args.dryRun)
        await scheduleOnboardingReminders(ctx, user._id, {
          cutoff: args.cutoff,
          sendAfter: nextSendAfter,
        });
      // At most one catch-up email per user, spaced two seconds apart.
      if (age >= 24 * HOUR) nextSendAfter += 2000;
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      eligible,
      alreadyEnrolled,
      excluded,
      immediate,
      future,
      nextSendAfter,
    };
  },
});

async function cancelScheduled(
  ctx: MutationCtx,
  scheduledId?: Id<"_scheduled_functions">,
) {
  if (!scheduledId) return;
  const job = await ctx.db.system.get("_scheduled_functions", scheduledId);
  if (job?.state.kind === "pending") await ctx.scheduler.cancel(scheduledId);
}

export async function cancelOnboardingReminders(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  const rows = await ctx.db
    .query("onboardingReminders")
    .withIndex("by_userId_and_phase", (q) => q.eq("userId", userId))
    .take(2);
  for (const row of rows) {
    if (row.status !== "pending" && row.status !== "sending") continue;
    await cancelScheduled(ctx, row.scheduledId);
    await ctx.db.patch("onboardingReminders", row._id, {
      status: "canceled",
      scheduledId: undefined,
    });
  }
}

export const updateMyLanguage = mutation({
  args: { language: languageValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const rows = await ctx.db
      .query("onboardingReminders")
      .withIndex("by_userId_and_phase", (q) => q.eq("userId", userId))
      .take(2);
    for (const row of rows)
      if (!row.delivery && row.language !== args.language)
        await ctx.db.patch("onboardingReminders", row._id, {
          language: args.language,
        });
    return null;
  },
});

export const prepare = internalMutation({
  args: {
    reminderId: v.id("onboardingReminders"),
    unsubscribeToken: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      to: v.string(),
      displayName: v.union(v.string(), v.null()),
      language: languageValidator,
      phase: v.union(v.literal("24h"), v.literal("72h")),
      deliveryKey: v.string(),
      unsubscribeToken: v.string(),
      attempt: v.number(),
      unsubscribeUrl: v.string(),
      message: v.object({
        subject: v.string(),
        html: v.string(),
        text: v.string(),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("onboardingReminders", args.reminderId);
    const now = Date.now();
    if (
      !row ||
      (row.status !== "pending" && row.status !== "sending") ||
      now < row.dueAt
    )
      return null;
    if (
      row.status === "sending" &&
      now - (row.lastAttemptAt ?? now) < RETRY_DELAY_MS
    )
      return null;
    const [user, profile, deletion, preference] = await Promise.all([
      ctx.db.get("users", row.userId),
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId))
        .unique(),
      ctx.db
        .query("accountDeletionJobs")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId))
        .unique(),
      ctx.db
        .query("emailPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId))
        .unique(),
    ]);
    if (
      !user?.email ||
      profile?.onboardingCompleted ||
      deletion ||
      preference?.frequency === "never"
    ) {
      await cancelOnboardingReminders(ctx, row.userId);
      return null;
    }
    if (
      row.attempts >= 5 ||
      (row.firstAttemptAt !== undefined &&
        now - row.firstAttemptAt >= 12 * HOUR)
    ) {
      await cancelScheduled(ctx, row.scheduledId);
      await ctx.db.patch("onboardingReminders", row._id, {
        status: "failed",
        scheduledId: undefined,
      });
      return null;
    }
    await cancelScheduled(ctx, row.scheduledId);
    // This watchdog also recovers an action that crashes after the provider accepts it.
    const scheduledId = await ctx.scheduler.runAfter(
      RETRY_DELAY_MS,
      internal.onboardingReminderActions.send,
      { reminderId: row._id },
    );
    const unsubscribeToken = row.unsubscribeToken ?? args.unsubscribeToken;
    const recipient = {
      to: user.email,
      displayName: profile?.preferredDisplayName ?? user.name ?? null,
      language: row.language,
    };
    const unsubscribeUrl = `${env.CONVEX_SITE_URL}/onboarding-reminders/unsubscribe?token=${unsubscribeToken}`;
    const delivery = row.delivery ?? {
      ...recipient,
      unsubscribeUrl,
      message: buildOnboardingReminderEmail({
        ...recipient,
        phase: row.phase,
        setupUrl: requirePublicAppUrl(env.PUBLIC_APP_URL),
        unsubscribeUrl,
      }),
    };
    const attempt = row.attempts + 1;
    await ctx.db.patch("onboardingReminders", row._id, {
      status: "sending",
      attempts: attempt,
      firstAttemptAt: row.firstAttemptAt ?? now,
      lastAttemptAt: now,
      scheduledId,
      unsubscribeToken,
      delivery,
    });
    return {
      ...delivery,
      phase: row.phase,
      deliveryKey: `onboarding/${row._id}`,
      unsubscribeToken,
      attempt,
    };
  },
});

export const finish = internalMutation({
  args: {
    reminderId: v.id("onboardingReminders"),
    attempt: v.number(),
    resendEmailId: v.optional(v.string()),
    retryable: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("onboardingReminders", args.reminderId);
    if (!row || row.attempts !== args.attempt) return null;
    const deletion = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_userId", (q) => q.eq("userId", row.userId))
      .unique();
    if (deletion || !(await ctx.db.get("users", row.userId))) return null;
    if (args.resendEmailId) {
      await cancelScheduled(ctx, row.scheduledId);
      const now = Date.now();
      await ctx.db.patch("onboardingReminders", row._id, {
        status: "sent",
        resendEmailId: args.resendEmailId,
        sentAt: now,
        scheduledId: undefined,
      });
      const existing = await ctx.db
        .query("emailDeliveries")
        .withIndex("by_resendEmailId", (q) =>
          q.eq("resendEmailId", args.resendEmailId!),
        )
        .unique();
      if (!existing)
        await ctx.db.insert("emailDeliveries", {
          userId: row.userId,
          deliveryKey: `onboarding/${row._id}`,
          resendEmailId: args.resendEmailId,
          sentAt: now,
          lastEventAt: now,
          lastEventType: "sent",
          openCount: 0,
          clickCount: 0,
        });
    } else if (row.status === "sending" && !args.retryable) {
      await cancelScheduled(ctx, row.scheduledId);
      await ctx.db.patch("onboardingReminders", row._id, {
        status: "failed",
        scheduledId: undefined,
      });
    }
    return null;
  },
});

export const unsubscribeLanguage = internalQuery({
  args: { token: v.string() },
  returns: v.union(languageValidator, v.null()),
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("onboardingReminders")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .unique();
    return row?.delivery?.language ?? row?.language ?? null;
  },
});

export const unsubscribe = internalMutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("onboardingReminders")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
      .unique();
    if (!row) return false;
    await cancelOnboardingReminders(ctx, row.userId);
    return true;
  },
});

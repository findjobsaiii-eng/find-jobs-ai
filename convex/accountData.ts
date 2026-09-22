import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

const BATCH_SIZE = 20;

export const deleteMine = mutation({
  args: { confirmation: v.literal("DELETE") },
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const existing = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return null;
    const jobId = await ctx.db.insert("accountDeletionJobs", {
      userId,
      stage: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.accountData.deleteBatch, {
      jobId,
    });
    return null;
  },
});

export const deleteBatch = internalMutation({
  args: { jobId: v.id("accountDeletionJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("accountDeletionJobs", jobId);
    if (!job) return null;
    const userId = job.userId;
    let hasRows = false;

    switch (job.stage) {
      case 0: {
        const rows = await ctx.db
          .query("jobApplicationEvents")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows)
          await ctx.db.delete("jobApplicationEvents", row._id);
        break;
      }
      case 1: {
        const rows = await ctx.db
          .query("jobApplications")
          .withIndex("by_userId_and_jobId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("jobApplications", row._id);
        break;
      }
      case 2: {
        const rows = await ctx.db
          .query("jobDeepReviews")
          .withIndex("by_userId_and_jobId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("jobDeepReviews", row._id);
        break;
      }
      case 3: {
        const rows = await ctx.db
          .query("jobMatches")
          .withIndex("by_userId_and_jobId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("jobMatches", row._id);
        break;
      }
      case 4: {
        const rows = await ctx.db
          .query("jobDiscoveries")
          .withIndex("by_userId_and_discoveredAt", (q) =>
            q.eq("userId", userId),
          )
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("jobDiscoveries", row._id);
        break;
      }
      case 5: {
        const rows = await ctx.db
          .query("jobSearchUsage")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("jobSearchUsage", row._id);
        break;
      }
      case 6: {
        const rows = await ctx.db
          .query("jobSearchRuns")
          .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) {
          await ctx.db.delete("jobSearchRuns", row._id);
          const remaining = await ctx.db
            .query("jobSearchRuns")
            .withIndex("by_queryId", (q) => q.eq("queryId", row.queryId))
            .first();
          if (!remaining) await ctx.db.delete("jobSearchQueries", row.queryId);
        }
        break;
      }
      case 7: {
        const rows = await ctx.db
          .query("dailyDiscoveryAttempts")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows)
          await ctx.db.delete("dailyDiscoveryAttempts", row._id);
        break;
      }
      case 8: {
        const rows = await ctx.db
          .query("resumeDocuments")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) {
          await ctx.storage.delete(row.storageId);
          await ctx.db.delete("resumeDocuments", row._id);
        }
        break;
      }
      case 9: {
        const rows = await ctx.db
          .query("candidateProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows)
          await ctx.db.delete("candidateProfiles", row._id);
        break;
      }
      case 10: {
        const rows = await ctx.db
          .query("catalogItems")
          .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
            q.eq("ownerUserId", userId),
          )
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("catalogItems", row._id);
        break;
      }
      case 11: {
        const rows = await ctx.db
          .query("userEntitlements")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows)
          await ctx.db.delete("userEntitlements", row._id);
        break;
      }
      case 12: {
        const rows = await ctx.db
          .query("legalConsents")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows) await ctx.db.delete("legalConsents", row._id);
        break;
      }
      case 13: {
        const rows = await ctx.db
          .query("emailPreferences")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows)
          await ctx.db.delete("emailPreferences", row._id);
        break;
      }
      case 14: {
        const sessions = await ctx.db
          .query("authSessions")
          .withIndex("userId", (q) => q.eq("userId", userId))
          .take(1);
        if (sessions.length) {
          hasRows = true;
          const session = sessions[0];
          const tokens = await ctx.db
            .query("authRefreshTokens")
            .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
            .take(BATCH_SIZE);
          const verifiers = await ctx.db
            .query("authVerifiers")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
            .take(BATCH_SIZE);
          for (const token of tokens)
            await ctx.db.delete("authRefreshTokens", token._id);
          for (const verifier of verifiers)
            await ctx.db.delete("authVerifiers", verifier._id);
          if (!tokens.length && !verifiers.length)
            await ctx.db.delete("authSessions", session._id);
        }
        break;
      }
      case 15: {
        const accounts = await ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
          .take(1);
        if (accounts.length) {
          hasRows = true;
          const account = accounts[0];
          const codes = await ctx.db
            .query("authVerificationCodes")
            .withIndex("accountId", (q) => q.eq("accountId", account._id))
            .take(BATCH_SIZE);
          for (const code of codes)
            await ctx.db.delete("authVerificationCodes", code._id);
          if (!codes.length) await ctx.db.delete("authAccounts", account._id);
        }
        break;
      }
      case 16: {
        const rows = await ctx.db
          .query("resumeUploadRateLimits")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);
        hasRows = rows.length > 0;
        for (const row of rows)
          await ctx.db.delete("resumeUploadRateLimits", row._id);
        break;
      }
      default: {
        await ctx.db.delete("users", userId);
        await ctx.db.delete("accountDeletionJobs", jobId);
        return null;
      }
    }

    if (!hasRows)
      await ctx.db.patch("accountDeletionJobs", jobId, {
        stage: job.stage + 1,
      });
    await ctx.scheduler.runAfter(0, internal.accountData.deleteBatch, {
      jobId,
    });
    return null;
  },
});

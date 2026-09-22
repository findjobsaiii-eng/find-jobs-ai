import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const VERSION = "2026-09-22-draft-1";

export const getCurrent = query({
  args: {},
  returns: v.union(
    v.object({
      termsVersion: v.string(),
      privacyVersion: v.string(),
      acceptedAt: v.number(),
      marketingOptIn: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const record = await ctx.db
      .query("legalConsents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return record
      ? {
          termsVersion: record.termsVersion,
          privacyVersion: record.privacyVersion,
          acceptedAt: record.acceptedAt,
          marketingOptIn: record.marketingOptIn,
        }
      : null;
  },
});

export const acceptCurrent = mutation({
  args: {
    termsVersion: v.literal(VERSION),
    privacyVersion: v.literal(VERSION),
    marketingOptIn: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const existing = await ctx.db
      .query("legalConsents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("legalConsents", existing._id, {
        termsVersion: args.termsVersion,
        privacyVersion: args.privacyVersion,
        acceptedAt: now,
        marketingOptIn: args.marketingOptIn,
        marketingUpdatedAt: now,
      });
    } else {
      await ctx.db.insert("legalConsents", {
        userId,
        termsVersion: args.termsVersion,
        privacyVersion: args.privacyVersion,
        acceptedAt: now,
        marketingOptIn: args.marketingOptIn,
        marketingUpdatedAt: now,
      });
    }
    return null;
  },
});

export const setMarketingOptIn = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const existing = await ctx.db
      .query("legalConsents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!existing) throw new ConvexError({ code: "CONSENT_REQUIRED" });
    await ctx.db.patch("legalConsents", existing._id, {
      marketingOptIn: args.enabled,
      marketingUpdatedAt: Date.now(),
    });
    return null;
  },
});

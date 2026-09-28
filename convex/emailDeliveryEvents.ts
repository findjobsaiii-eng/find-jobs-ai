import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const emailEventTypeValidator = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delivery_delayed"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("opened"),
  v.literal("clicked"),
  v.literal("failed"),
  v.literal("suppressed"),
);

export const recordWebhookEvent = internalMutation({
  args: {
    providerEventId: v.string(),
    resendEmailId: v.string(),
    type: emailEventTypeValidator,
    occurredAt: v.number(),
  },
  returns: v.union(
    v.literal("recorded"),
    v.literal("duplicate"),
    v.literal("delivery_not_found"),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailDeliveryEvents")
      .withIndex("by_providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId),
      )
      .unique();
    if (existing) return "duplicate";

    const delivery = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_resendEmailId", (q) =>
        q.eq("resendEmailId", args.resendEmailId),
      )
      .unique();
    if (!delivery) return "delivery_not_found";

    await ctx.db.insert("emailDeliveryEvents", {
      providerEventId: args.providerEventId,
      deliveryId: delivery._id,
      userId: delivery.userId,
      type: args.type,
      occurredAt: args.occurredAt,
    });
    await ctx.db.patch("emailDeliveries", delivery._id, {
      lastEventAt: Math.max(delivery.lastEventAt, args.occurredAt),
      lastEventType: args.type,
      ...(args.type === "delivered" ? { deliveredAt: args.occurredAt } : {}),
      ...(args.type === "bounced" ? { bouncedAt: args.occurredAt } : {}),
      ...(args.type === "complained" ? { complainedAt: args.occurredAt } : {}),
      ...(args.type === "opened"
        ? {
            firstOpenedAt: delivery.firstOpenedAt ?? args.occurredAt,
            openCount: delivery.openCount + 1,
          }
        : {}),
      ...(args.type === "clicked"
        ? {
            firstClickedAt: delivery.firstClickedAt ?? args.occurredAt,
            clickCount: delivery.clickCount + 1,
          }
        : {}),
    });
    return "recorded";
  },
});

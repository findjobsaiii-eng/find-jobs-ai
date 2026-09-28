/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("product analytics", () => {
  it("records authenticated activity and throttles repeat visits", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "candidate@example.com" }),
    );
    const user = t.withIdentity({
      subject: `${userId}|session`,
      issuer: "https://test.example",
      tokenIdentifier: `https://test.example|${userId}`,
    });

    await expect(
      t.mutation(api.productAnalytics.recordClientEvent, {
        event: "app_visited",
      }),
    ).rejects.toThrow(/UNAUTHENTICATED/u);

    await user.mutation(api.productAnalytics.recordClientEvent, {
      event: "app_visited",
    });
    await user.mutation(api.productAnalytics.recordClientEvent, {
      event: "app_visited",
    });
    await user.mutation(api.productAnalytics.recordClientEvent, {
      event: "job_feed_viewed",
      view: "suggestions",
    });

    const stored = await t.run(async (ctx) => ({
      activity: await ctx.db
        .query("userActivity")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
      events: await ctx.db
        .query("productEvents")
        .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
        .take(10),
    }));
    expect(stored.events.map((event) => event.event).sort()).toEqual([
      "app_visited",
      "job_feed_viewed",
    ]);
    expect(stored.activity?.lastMeaningfulEvent).toBe("job_feed_viewed");
  });

  it("deduplicates webhook events and updates delivery engagement", async () => {
    const t = convexTest(schema, modules);
    const { userId, deliveryId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "candidate@example.com",
      });
      const deliveryId = await ctx.db.insert("emailDeliveries", {
        userId,
        deliveryKey: `daily/${userId}/2026-09-28`,
        resendEmailId: "email_123",
        sentAt: 100,
        lastEventAt: 100,
        lastEventType: "sent",
        openCount: 0,
        clickCount: 0,
      });
      return { userId, deliveryId };
    });

    const args = {
      providerEventId: "event_123",
      resendEmailId: "email_123",
      type: "clicked" as const,
      occurredAt: 200,
    };
    await expect(
      t.mutation(internal.emailDeliveryEvents.recordWebhookEvent, args),
    ).resolves.toBe("recorded");
    await expect(
      t.mutation(internal.emailDeliveryEvents.recordWebhookEvent, args),
    ).resolves.toBe("duplicate");

    const stored = await t.run(async (ctx) => ({
      delivery: await ctx.db.get("emailDeliveries", deliveryId),
      events: await ctx.db
        .query("emailDeliveryEvents")
        .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
        .take(10),
    }));
    expect(stored.delivery).toMatchObject({
      firstClickedAt: 200,
      clickCount: 1,
      lastEventType: "clicked",
    });
    expect(stored.events).toHaveLength(1);
  });
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { discoveryBucket, israelDiscoveryBucket } from "./dailyDiscovery";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("claims only paid completed profiles once per Israel day and continues beyond one page", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let index = 0; index < 8; index++) {
      const userId = await ctx.db.insert("users", {});
      await ctx.db.insert("candidateProfiles", {
        userId,
        email: "candidate@example.com",
        onboardingCompleted: index < 7,
        onboardingStep: 4,
        createdAt: 1,
        updatedAt: 1,
      });
      if (index < 7) {
        await ctx.db.insert("userEntitlements", {
          userId,
          plan: index < 6 ? "pro" : "free",
          active: true,
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
        });
      }
    }
  });
  await t.mutation(internal.dailyDiscovery.dispatch, { bucket: null });
  const cursor = await t.run(async (ctx) => {
    expect(await ctx.db.query("dailyDiscoveryAttempts").collect()).toHaveLength(
      5,
    );
    const scheduled = await ctx.db.system
      .query("_scheduled_functions")
      .collect();
    const args = scheduled[0].args[0] as { cursor: string };
    return args.cursor;
  });
  await t.mutation(internal.dailyDiscovery.dispatch, { cursor, bucket: null });
  await t.mutation(internal.dailyDiscovery.dispatch, { bucket: null });
  const attempts = await t.run(async (ctx) =>
    ctx.db.query("dailyDiscoveryAttempts").collect(),
  );
  expect(attempts).toHaveLength(6);
  // Workers have no browser auth session. One invalid profile must not stop another.
  await t.action(internal.jobDiscoveryActions.runDailyBatch, {
    userIds: attempts.slice(0, 2).map((attempt) => attempt.userId),
    cursor: null,
  });
  const finished = await t.run(async (ctx) =>
    ctx.db.query("dailyDiscoveryAttempts").collect(),
  );
  expect(
    finished.filter(
      (attempt) => attempt.lastOutcome === "INCOMPLETE_SEARCH_PROFILE",
    ),
  ).toHaveLength(2);
}, 15_000);

it("spreads users over ten Israel-time hourly buckets", () => {
  const buckets = new Set(
    Array.from({ length: 1_000 }, (_, index) =>
      discoveryBucket(`users:${index}`),
    ),
  );
  expect([...buckets].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(israelDiscoveryBucket(Date.parse("2026-09-08T05:00:00Z"))).toBe(0);
  expect(israelDiscoveryBucket(Date.parse("2026-09-08T14:00:00Z"))).toBe(9);
  expect(israelDiscoveryBucket(Date.parse("2026-09-08T15:00:00Z"))).toBeNull();
});

it("queues a new pilot user immediately without a purchased entitlement", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.insert("candidateProfiles", {
      userId: id,
      email: "new@example.com",
      onboardingCompleted: true,
      onboardingStep: 4,
      createdAt: 1,
      updatedAt: 1,
    });
    return id;
  });
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("dailyDiscoveryAttempts").collect()).toHaveLength(
      1,
    );
    expect(
      await ctx.db.system.query("_scheduled_functions").collect(),
    ).toHaveLength(1);
  });
});

it("retries an empty discovery at most three times in the same day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T09:00:00Z"));
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.insert("dailyDiscoveryAttempts", {
      userId: id,
      dayKey: "2026-09-15",
      attemptCount: 1,
      lastAttemptAt: Date.now(),
      lastOutcome: "queued",
    });
    return id;
  });

  await t.mutation(internal.dailyDiscovery.finishAttempt, {
    userId,
    outcome: "completed_empty",
    retryable: true,
  });
  await t.run(async (ctx) => {
    const attempt = await ctx.db.query("dailyDiscoveryAttempts").unique();
    if (!attempt) throw new Error("Expected discovery attempt");
    expect(attempt.nextAttemptAt).toBe(Date.now() + 15 * 60 * 1_000);
    expect(
      await ctx.db.system.query("_scheduled_functions").collect(),
    ).toHaveLength(1);
    await ctx.db.patch("dailyDiscoveryAttempts", attempt._id, {
      attemptCount: 3,
    });
  });
  await t.mutation(internal.dailyDiscovery.finishAttempt, {
    userId,
    outcome: "completed_empty",
    retryable: true,
  });
  await t.run(async (ctx) => {
    const attempt = await ctx.db.query("dailyDiscoveryAttempts").unique();
    if (!attempt) throw new Error("Expected discovery attempt");
    expect(attempt.nextAttemptAt).toBeUndefined();
    expect(
      await ctx.db.system.query("_scheduled_functions").collect(),
    ).toHaveLength(1);
  });
});

it("disables the manual action and panel by default even for signed-in users", async () => {
  vi.stubEnv("DEV_TOOLS_ENABLED", "false");
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  expect(await user.query(api.jobDiscovery.developmentToolsEnabled, {})).toBe(
    false,
  );
  await expect(
    user.action(api.jobDiscoveryActions.discoverJobsForCurrentUser, {}),
  ).rejects.toThrow(/DEV_TOOLS_DISABLED/u);
  vi.stubEnv("DEV_TOOLS_ENABLED", "true");
  expect(await user.query(api.jobDiscovery.developmentToolsEnabled, {})).toBe(
    true,
  );
}, 15_000);

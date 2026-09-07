/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
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
      if (index < 6) {
        await ctx.db.insert("userEntitlements", {
          userId,
          plan: "pro",
          active: true,
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
        });
      }
    }
  });
  await t.mutation(internal.dailyDiscovery.dispatch, {});
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
  await t.mutation(internal.dailyDiscovery.dispatch, { cursor });
  await t.mutation(internal.dailyDiscovery.dispatch, {});
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
});

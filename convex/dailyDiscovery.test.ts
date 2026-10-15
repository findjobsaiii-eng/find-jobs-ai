/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import { discoveryFailureReason } from "./jobDiscoveryActions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  discoveryBucket,
  discoverySchedule,
  israelDiscoveryBucket,
} from "./jobDiscoverySchedule";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "daily"));
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

async function scheduledUser(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await ctx.db.insert("candidateProfiles", {
      userId,
      email: "candidate@example.com",
      onboardingCompleted: true,
      onboardingStep: 4,
      createdAt: 1,
      updatedAt: 1,
    });
    return userId;
  });
}

function weeklySlot(userId: string, week = 0) {
  const base = Date.UTC(2026, 9, 11 + week * 7, 9);
  const slot = discoverySchedule(userId, base, "weekly");
  // These fixtures precede the 25 October DST change (UTC+3).
  return Date.UTC(2026, 9, 11 + week * 7 + slot.weekday!, 5 + slot.bucket, 7);
}

it("queues a weekly user's first search immediately and counts it for that week", async () => {
  vi.useFakeTimers();
  vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "weekly");
  vi.setSystemTime(new Date("2026-10-11T01:00:00Z")); // Outside every scheduled hour.
  const t = convexTest(schema, modules);
  const userId = await scheduledUser(t);
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  const firstAttempt = await t.run((ctx) =>
    ctx.db.query("dailyDiscoveryAttempts").unique(),
  );
  vi.setSystemTime(weeklySlot(userId));
  await t.mutation(internal.dailyDiscovery.dispatch, {});
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  expect(
    await t.run((ctx) => ctx.db.query("dailyDiscoveryAttempts").unique()),
  ).toEqual(firstAttempt);
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(1);
  vi.setSystemTime(weeklySlot(userId, 1));
  await t.mutation(internal.dailyDiscovery.dispatch, {});
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(2);
});

it("dispatches weekly users only on their assigned weekday and rotating hour", async () => {
  vi.useFakeTimers();
  vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "weekly");
  const t = convexTest(schema, modules);
  const userId = await scheduledUser(t);
  const slot = weeklySlot(userId);
  vi.setSystemTime(slot - 86400000);
  await t.mutation(internal.dailyDiscovery.dispatch, {});
  vi.setSystemTime(slot - 3600000);
  await t.mutation(internal.dailyDiscovery.dispatch, {});
  expect(
    await t.run((ctx) => ctx.db.query("dailyDiscoveryAttempts").unique()),
  ).toBeNull();
  vi.setSystemTime(slot);
  await t.mutation(internal.dailyDiscovery.dispatch, {});
  await t.mutation(internal.dailyDiscovery.dispatch, {});
  const attempt = await t.run((ctx) =>
    ctx.db.query("dailyDiscoveryAttempts").unique(),
  );
  expect(attempt).toMatchObject({ userId, lastAttemptAt: slot });
  vi.setSystemTime(slot + 86400000);
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  expect(
    await t.run((ctx) => ctx.db.query("dailyDiscoveryAttempts").unique()),
  ).toEqual(attempt);
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(1);
});

it("changes back to daily without a duplicate search on the switching day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T09:00:00Z"));
  vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "weekly");
  const t = convexTest(schema, modules);
  const userId = await scheduledUser(t);
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "daily");
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(1);
  vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(2);
  vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "weekly");
  vi.setSystemTime(new Date("2026-10-13T09:00:00Z"));
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(2);
});

it("does not resume yesterday's paginated sweep on a new calendar day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
  const t = convexTest(schema, modules);
  await scheduledUser(t);
  await t.mutation(internal.dailyDiscovery.dispatch, {
    bucket: null,
    scheduledAt: Date.parse("2026-10-14T09:00:00Z"),
  });
  expect(
    await t.run((ctx) => ctx.db.query("dailyDiscoveryAttempts").unique()),
  ).toBeNull();
});

it("does not let an expired worker overwrite a newer day's attempt", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
  const t = convexTest(schema, modules);
  const userId = await scheduledUser(t);
  await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
  const current = await t.run((ctx) =>
    ctx.db.query("dailyDiscoveryAttempts").unique(),
  );
  await t.action(internal.jobDiscoveryActions.runDailyBatch, {
    userIds: [userId],
    cursor: null,
    scheduledAt: Date.parse("2026-10-14T09:00:00Z"),
  });
  expect(
    await t.run((ctx) => ctx.db.query("dailyDiscoveryAttempts").unique()),
  ).toEqual(current);
});

it("claims one weekly attempt when onboarding and cron enqueue concurrently", async () => {
  vi.useFakeTimers();
  vi.stubEnv("JOB_SEARCH_AUTOMATIC_CADENCE", "weekly");
  const t = convexTest(schema, modules);
  const userId = await scheduledUser(t);
  vi.setSystemTime(weeklySlot(userId));
  await Promise.all([
    t.mutation(internal.dailyDiscovery.enqueueUser, { userId }),
    t.mutation(internal.dailyDiscovery.dispatch, {}),
  ]);
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(1);
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
    expect(await ctx.db.query("dailyDiscoveryAudits").unique()).toMatchObject({
      userId,
      status: "queued",
      reason: "scheduled",
      attemptCount: 1,
    });
    expect(
      await ctx.db.system.query("_scheduled_functions").collect(),
    ).toHaveLength(1);
  });
});

it.each([
  ["completed", "completed"],
  ["completed_empty", "completed"],
  ["provider_rate_limit", "failed"],
  ["INCOMPLETE_SEARCH_PROFILE", "failed"],
  ["no_search", "skipped"],
  ["reused", "skipped"],
])(
  "preserves %s in the admin audit and does not queue again on the same Israel day",
  async (outcome, status) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T09:00:00Z"));
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {});
      await ctx.db.insert("candidateProfiles", {
        userId: id,
        email: "candidate@example.com",
        onboardingCompleted: true,
        onboardingStep: 4,
        createdAt: 1,
        updatedAt: 1,
      });
      return id;
    });
    await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
    await t.mutation(internal.dailyDiscovery.finishAttempt, {
      userId,
      outcome,
    });
    const originalAudit = await t.run((ctx) =>
      ctx.db.query("dailyDiscoveryAudits").unique(),
    );
    expect(originalAudit).toMatchObject({ status, reason: outcome });
    vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
    await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
    await t.mutation(internal.dailyDiscovery.dispatch, { bucket: null });
    expect(
      await t.run((ctx) => ctx.db.query("dailyDiscoveryAudits").unique()),
    ).toEqual(originalAudit);
    // A plan change must not hide today's completed or failed attempt either.
    await t.run((ctx) =>
      ctx.db.insert("userEntitlements", {
        userId,
        plan: "free",
        active: true,
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
    await t.mutation(internal.dailyDiscovery.dispatch, { bucket: null });
    expect(
      await t.run((ctx) => ctx.db.query("dailyDiscoveryAudits").unique()),
    ).toEqual(originalAudit);
    await t.run(async (ctx) => {
      const entitlement = await ctx.db.query("userEntitlements").unique();
      if (entitlement) await ctx.db.delete("userEntitlements", entitlement._id);
    });
    await t.run(async (ctx) => {
      expect(
        await ctx.db.system.query("_scheduled_functions").collect(),
      ).toHaveLength(1);
      expect(
        await ctx.db.query("dailyDiscoveryAttempts").unique(),
      ).toMatchObject({
        lastOutcome: outcome,
        attemptCount: 1,
      });
    });
    vi.setSystemTime(new Date("2026-09-16T09:00:00Z"));
    await t.mutation(internal.dailyDiscovery.enqueueUser, { userId });
    await t.run(async (ctx) => {
      expect(
        await ctx.db.system.query("_scheduled_functions").collect(),
      ).toHaveLength(2);
    });
  },
);

it("rotates six roles in saved order, wraps, and claims once across Israel midnight", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const roles = [
    "Zoologist",
    "Architect",
    "Designer",
    "Engineer",
    "Analyst",
    "Manager",
  ];
  for (let day = 0; day < 7; day++) {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15 + day, 20, 59)));
    const args = { userId, roles };
    const claims = await Promise.all([
      t.mutation(internal.dailyDiscovery.claimDailyRole, args),
      t.mutation(internal.dailyDiscovery.claimDailyRole, args),
    ]);
    expect(claims.filter((role) => role !== null)).toEqual([
      roles[day % roles.length],
    ]);
  }
  // 21:00 UTC is the next Israel calendar day during daylight saving time.
  vi.setSystemTime(new Date("2026-09-21T21:00:00Z"));
  expect(
    await t.mutation(internal.dailyDiscovery.claimDailyRole, { userId, roles }),
  ).toBe(roles[1]);
});

it("keeps single-role users daily and bounds the cursor when roles change", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  for (let day = 0; day < 2; day++) {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15 + day, 9)));
    expect(
      await t.mutation(internal.dailyDiscovery.claimDailyRole, {
        userId,
        roles: ["Engineer"],
      }),
    ).toBe("Engineer");
  }
  vi.setSystemTime(new Date("2026-09-17T09:00:00Z"));
  expect(
    await t.mutation(internal.dailyDiscovery.claimDailyRole, {
      userId,
      roles: ["Engineer", "Designer", "Analyst"],
    }),
  ).toBe("Engineer");
  vi.setSystemTime(new Date("2026-09-18T09:00:00Z"));
  expect(
    await t.mutation(internal.dailyDiscovery.claimDailyRole, {
      userId,
      roles: ["Analyst"],
    }),
  ).toBe("Analyst");
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

it("records specific provider failures and keeps configuration/profile errors", () => {
  expect(
    discoveryFailureReason(
      new ConvexError({
        code: "JOB_DISCOVERY_FAILED",
        category: "provider_rate_limit",
      }),
    ),
  ).toBe("provider_rate_limit");
  expect(
    discoveryFailureReason(
      new ConvexError({ code: "INCOMPLETE_SEARCH_PROFILE" }),
    ),
  ).toBe("INCOMPLETE_SEARCH_PROFILE");
  expect(
    discoveryFailureReason(new ConvexError({ code: "JOB_DISCOVERY_FAILED" })),
  ).toBe("JOB_DISCOVERY_FAILED");
  expect(discoveryFailureReason(new Error("unexpected"))).toBe("UNKNOWN");
});

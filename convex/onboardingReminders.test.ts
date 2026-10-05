/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import {
  cancelOnboardingReminders,
  RETRY_DELAY_MS,
  scheduleOnboardingReminders,
} from "./onboardingReminders";
import { buildOnboardingReminderEmail } from "./onboardingReminderTemplate";

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));
const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 5);
const TOKEN = "a".repeat(64);

it("enrolls historical accounts once, sending only one overdue reminder and preserving future dates", async () => {
  const t = convexTest(schema, modules);
  const ids: Id<"users">[] = [];
  for (const age of [4 * DAY, 2 * DAY, DAY / 2]) {
    vi.setSystemTime(START - age);
    ids.push(
      await t.run((ctx) =>
        ctx.db.insert("users", { email: `age${age}@example.com` }),
      ),
    );
  }
  vi.setSystemTime(START);
  const args = {
    paginationOpts: { numItems: 50, cursor: null },
    cutoff: START,
    sendAfter: START + 60_000,
    dryRun: true,
  };
  expect(
    await t.mutation(internal.onboardingReminders.enrollExistingPage, args),
  ).toMatchObject({ scanned: 3, eligible: 3, immediate: 2, future: 3 });
  expect(
    await t.run((ctx) => ctx.db.query("onboardingReminders").collect()),
  ).toHaveLength(0);
  await t.mutation(internal.onboardingReminders.enrollExistingPage, {
    ...args,
    dryRun: false,
  });
  const byUser = await t.run(async (ctx) =>
    Promise.all(
      ids.map((userId) =>
        ctx.db
          .query("onboardingReminders")
          .withIndex("by_userId_and_phase", (q) => q.eq("userId", userId))
          .take(2),
      ),
    ),
  );
  expect(byUser.map((rows) => rows.map((r) => [r.phase, r.dueAt]))).toEqual([
    [["72h", START + 60_000]],
    [
      ["24h", START + 62_000],
      ["72h", START + DAY],
    ],
    [
      ["24h", START + DAY / 2],
      ["72h", START + 2.5 * DAY],
    ],
  ]);
  expect(
    await t.mutation(internal.onboardingReminders.enrollExistingPage, {
      ...args,
      dryRun: false,
    }),
  ).toMatchObject({ eligible: 0, alreadyEnrolled: 3 });
  expect(
    await t.run((ctx) => ctx.db.query("onboardingReminders").collect()),
  ).toHaveLength(5);
});

it("pages enrollment and skips completion, opt-out, missing emails and deletion", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const completed = await ctx.db.insert("users", {
      email: "done@example.com",
    });
    await ctx.db.insert("candidateProfiles", {
      userId: completed,
      email: "done@example.com",
      onboardingStep: 4,
      onboardingCompleted: true,
      createdAt: START,
      updatedAt: START,
    });
    const optedOut = await ctx.db.insert("users", {
      email: "never@example.com",
    });
    await ctx.db.insert("emailPreferences", {
      userId: optedOut,
      frequency: "never",
      updatedAt: START,
    });
    await ctx.db.insert("users", {});
    const deleting = await ctx.db.insert("users", {
      email: "deleting@example.com",
    });
    await ctx.db.insert("accountDeletionJobs", {
      userId: deleting,
      stage: 0,
      createdAt: START,
    });
  });
  vi.setSystemTime(START + DAY);
  const args = {
    paginationOpts: { numItems: 2, cursor: null as string | null },
    cutoff: START + DAY,
    sendAfter: START,
    dryRun: false,
  };
  const first = await t.mutation(
    internal.onboardingReminders.enrollExistingPage,
    args,
  );
  expect(first).toMatchObject({
    scanned: 2,
    excluded: 2,
    eligible: 0,
    isDone: false,
  });
  expect(
    await t.mutation(internal.onboardingReminders.enrollExistingPage, {
      ...args,
      paginationOpts: { ...args.paginationOpts, cursor: first.continueCursor },
    }),
  ).toMatchObject({ scanned: 2, excluded: 2, isDone: true });
  await expect(
    t.mutation(internal.onboardingReminders.enrollExistingPage, {
      ...args,
      paginationOpts: { numItems: 51, cursor: null },
    }),
  ).rejects.toThrow("BATCH_TOO_LARGE");
});

it("executes the actual scheduled actions at 24 and 72 hours only", async () => {
  const t = convexTest(schema, modules);
  await signup(t);
  vi.advanceTimersByTime(DAY - 1);
  await t.finishInProgressScheduledFunctions();
  expect(sendEmail).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  expect(sendEmail).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2 * DAY);
  await t.finishInProgressScheduledFunctions();
  expect(sendEmail).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(10 * DAY);
  await t.finishInProgressScheduledFunctions();
  expect(sendEmail).toHaveBeenCalledTimes(2);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  sendEmail
    .mockReset()
    .mockResolvedValue({ data: { id: "email_1" }, error: null });
  for (const [key, value] of Object.entries({
    ONBOARDING_REMINDERS_ENABLED: "true",
    PUBLIC_APP_URL: "https://jobmiter.com",
    CONVEX_SITE_URL: "https://test.convex.site",
    RESEND_API_KEY: "test-key",
    AUTH_GOOGLE_ID: "test",
    AUTH_GOOGLE_SECRET: "test",
    JWKS: "{}",
    JWT_PRIVATE_KEY: "test",
    SITE_URL: "https://jobmiter.com",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function signup(
  t: TestConvex<typeof schema>,
  email = "candidate@example.com",
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email, name: "Candidate" });
    await scheduleOnboardingReminders(ctx, userId);
    const rows = await ctx.db
      .query("onboardingReminders")
      .withIndex("by_userId_and_phase", (q) => q.eq("userId", userId))
      .take(2);
    return { userId, rows };
  });
}

it("schedules exactly two reminders from signup, not subsequent sign-ins", async () => {
  const t = convexTest(schema, modules);
  const { userId, rows } = await signup(t);
  expect(rows.map((r) => [r.phase, r.dueAt])).toEqual([
    ["24h", START + DAY],
    ["72h", START + 3 * DAY],
  ]);
  await t.run((ctx) => scheduleOnboardingReminders(ctx, userId));
  expect(
    await t.run((ctx) => ctx.db.query("onboardingReminders").collect()),
  ).toHaveLength(2);
  expect(
    await t.mutation(internal.onboardingReminders.prepare, {
      reminderId: rows[0]._id,
      unsubscribeToken: TOKEN,
    }),
  ).toBeNull();
  expect(sendEmail).not.toHaveBeenCalled();
});

it("sends once when due with the setup CTA and records provider delivery", async () => {
  const t = convexTest(schema, modules);
  const { rows } = await signup(t);
  vi.setSystemTime(START + DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  const [payload, options] = sendEmail.mock.calls[0];
  expect(payload.to).toEqual(["candidate@example.com"]);
  expect(payload.text).toContain(
    "להמשיך בהגדרת Jobmiter: https://jobmiter.com",
  );
  expect(payload.headers["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );
  expect(options.idempotencyKey).toBe(`onboarding/${rows[0]._id}`);
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", rows[0]._id)),
  ).toMatchObject({ status: "sent", attempts: 1, resendEmailId: "email_1" });
  expect(
    await t.run((ctx) => ctx.db.query("emailDeliveries").collect()),
  ).toHaveLength(1);
});

it("sends the final reminder at 72 hours and never creates a third", async () => {
  const t = convexTest(schema, modules);
  const { rows } = await signup(t);
  vi.setSystemTime(START + 3 * DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[1]._id,
  });
  expect(sendEmail.mock.calls[0][0].text).toContain("תזכורת ההגדרה האחרונה");
  expect(
    await t.run((ctx) => ctx.db.query("onboardingReminders").collect()),
  ).toHaveLength(2);
});

it("cancels both schedules on completion and independently checks completed profiles before sending", async () => {
  const t = convexTest(schema, modules);
  const { userId, rows } = await signup(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("candidateProfiles", {
      userId,
      email: "candidate@example.com",
      onboardingStep: 4,
      onboardingCompleted: true,
      createdAt: START,
      updatedAt: START,
    });
  });
  vi.setSystemTime(START + DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  expect(sendEmail).not.toHaveBeenCalled();
  for (const row of rows)
    expect(
      await t.run((ctx) => ctx.db.get("onboardingReminders", row._id)),
    ).toMatchObject({ status: "canceled" });
  await t.run(async (ctx) => {
    for (const row of rows)
      expect(
        (await ctx.db.system.get("_scheduled_functions", row.scheduledId!))
          ?.state.kind,
      ).toBe("canceled");
  });
});

it("completion after the first email cancels the final reminder", async () => {
  const t = convexTest(schema, modules);
  const { userId, rows } = await signup(t);
  vi.setSystemTime(START + DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  await t.run((ctx) => cancelOnboardingReminders(ctx, userId));
  vi.setSystemTime(START + 3 * DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[1]._id,
  });
  expect(sendEmail).toHaveBeenCalledTimes(1);
});

it("retries transient failures with an identical payload/key and rejects overlapping claims", async () => {
  const t = convexTest(schema, modules);
  const { rows } = await signup(t);
  sendEmail.mockRejectedValueOnce(new Error("network"));
  vi.setSystemTime(START + DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  expect(
    await t.mutation(internal.onboardingReminders.prepare, {
      reminderId: rows[0]._id,
      unsubscribeToken: TOKEN,
    }),
  ).toBeNull();
  vi.setSystemTime(START + DAY + RETRY_DELAY_MS);
  vi.stubEnv("PUBLIC_APP_URL", "https://updated.example.com");
  vi.stubEnv("CONVEX_SITE_URL", "https://updated.convex.site");
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  expect(sendEmail.mock.calls[1]).toEqual(sendEmail.mock.calls[0]);
});

it("caps transient retries and stops on permanent provider errors", async () => {
  const t = convexTest(schema, modules);
  const { rows } = await signup(t);
  sendEmail.mockRejectedValue(new Error("network"));
  for (let i = 0; i < 6; i++) {
    vi.setSystemTime(START + DAY + i * RETRY_DELAY_MS);
    await t.action(internal.onboardingReminderActions.send, {
      reminderId: rows[0]._id,
    });
  }
  expect(sendEmail).toHaveBeenCalledTimes(5);
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", rows[0]._id)),
  ).toMatchObject({ status: "failed" });
  sendEmail.mockReset().mockResolvedValue({
    data: null,
    error: { name: "validation_error", statusCode: 422 },
  });
  vi.setSystemTime(START + 3 * DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[1]._id,
  });
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", rows[1]._id)),
  ).toMatchObject({ status: "failed" });
});

it("does not send for missing recipients, deletion requests, or email opt-out", async () => {
  const t = convexTest(schema, modules);
  for (const reason of ["deleted", "deleting", "optout"]) {
    const { userId, rows } = await signup(t, `${reason}@example.com`);
    await t.run(async (ctx) => {
      if (reason === "deleted") await ctx.db.delete("users", userId);
      if (reason === "deleting")
        await ctx.db.insert("accountDeletionJobs", {
          userId,
          createdAt: START,
          stage: 0,
        });
      if (reason === "optout")
        await ctx.db.insert("emailPreferences", {
          userId,
          frequency: "never",
          updatedAt: START,
        });
    });
    vi.setSystemTime(START + 4 * DAY);
    await t.action(internal.onboardingReminderActions.send, {
      reminderId: rows[0]._id,
    });
  }
  expect(sendEmail).not.toHaveBeenCalled();
});

it("updates only the caller's language, refuses unauthenticated writes, and freezes delivery language", async () => {
  const t = convexTest(schema, modules);
  const alice = await signup(t);
  const bob = await signup(t, "bob@example.com");
  await expect(
    t.mutation(api.onboardingReminders.updateMyLanguage, { language: "en" }),
  ).rejects.toThrow("UNAUTHENTICATED");
  const owner = t.withIdentity({
    subject: `${alice.userId}|test`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${alice.userId}`,
  });
  await owner.mutation(api.onboardingReminders.updateMyLanguage, {
    language: "en",
  });
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", bob.rows[0]._id)),
  ).toMatchObject({ language: "he" });
  vi.setSystemTime(START + DAY);
  const delivery = await t.mutation(internal.onboardingReminders.prepare, {
    reminderId: alice.rows[0]._id,
    unsubscribeToken: TOKEN,
  });
  expect(delivery?.language).toBe("en");
  await owner.mutation(api.onboardingReminders.updateMyLanguage, {
    language: "he",
  });
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", alice.rows[0]._id)),
  ).toMatchObject({ delivery: { language: "en" } });
});

it("GET unsubscribe is scanner-safe, POST cancels only that recipient, invalid tokens are rejected", async () => {
  const t = convexTest(schema, modules);
  const alice = await signup(t);
  const bob = await signup(t, "bob@example.com");
  vi.setSystemTime(START + DAY);
  await t.mutation(internal.onboardingReminders.prepare, {
    reminderId: alice.rows[0]._id,
    unsubscribeToken: TOKEN,
  });
  const url = `/onboarding-reminders/unsubscribe?token=${TOKEN}`;
  expect((await t.fetch(url)).status).toBe(200);
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", alice.rows[1]._id)),
  ).toMatchObject({ status: "pending" });
  expect((await t.fetch(url, { method: "POST" })).status).toBe(200);
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", alice.rows[1]._id)),
  ).toMatchObject({ status: "canceled" });
  expect(
    await t.run((ctx) => ctx.db.get("onboardingReminders", bob.rows[1]._id)),
  ).toMatchObject({ status: "pending" });
  expect(
    (
      await t.fetch("/onboarding-reminders/unsubscribe?token=guess", {
        method: "POST",
      })
    ).status,
  ).toBe(404);
  expect(
    await t.mutation(internal.onboardingReminders.unsubscribe, {
      token: "b".repeat(64),
    }),
  ).toBe(false);
});

it("does not call the provider when rollout is disabled", async () => {
  const t = convexTest(schema, modules);
  const { rows } = await signup(t);
  vi.stubEnv("ONBOARDING_REMINDERS_ENABLED", "false");
  vi.setSystemTime(START + DAY);
  await t.action(internal.onboardingReminderActions.send, {
    reminderId: rows[0]._id,
  });
  expect(sendEmail).not.toHaveBeenCalled();
});

it("does not recreate email records when an in-flight send finishes during account deletion", async () => {
  const t = convexTest(schema, modules);
  const { userId, rows } = await signup(t);
  vi.setSystemTime(START + DAY);
  const delivery = await t.mutation(internal.onboardingReminders.prepare, {
    reminderId: rows[0]._id,
    unsubscribeToken: TOKEN,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("accountDeletionJobs", {
      userId,
      createdAt: Date.now(),
      stage: 20,
    });
    await cancelOnboardingReminders(ctx, userId);
  });
  await t.mutation(internal.onboardingReminders.finish, {
    reminderId: rows[0]._id,
    attempt: delivery!.attempt,
    resendEmailId: "late-email",
    retryable: false,
  });
  expect(
    await t.run((ctx) => ctx.db.query("emailDeliveries").collect()),
  ).toHaveLength(0);
});

it("renders one setup CTA, safe names, English/LTR and Hebrew/RTL", () => {
  for (const language of ["en", "he"] as const) {
    const content = buildOnboardingReminderEmail({
      language,
      phase: "24h",
      displayName: '<script>alert("x")</script>',
      setupUrl: "https://jobmiter.com",
      unsubscribeUrl: "https://test.convex.site/unsubscribe",
    });
    expect(content.html).not.toContain("<script>");
    expect(content.html.match(/href="https:\/\/jobmiter.com"/g)).toHaveLength(
      1,
    );
    expect(content.html).toContain(
      `dir="${language === "he" ? "rtl" : "ltr"}"`,
    );
    if (language === "en")
      expect(content.text).toContain("Continue setting up Jobmiter");
  }
});

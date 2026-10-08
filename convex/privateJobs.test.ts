/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const details = {
  title: "Engineer",
  companyName: "Acme",
  sourceUrl: "",
  locationText: "",
  descriptionText: "",
};
const page = { paginationOpts: { cursor: null, numItems: 20 } };
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const [userId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "one@example.com" }),
    await ctx.db.insert("users", { email: "two@example.com" }),
  ]);
  const identity = (id: typeof userId) =>
    t.withIdentity({
      subject: `${id}|test`,
      issuer: "https://test.example",
      tokenIdentifier: `https://test.example|${id}`,
    });
  return {
    t,
    user: identity(userId),
    other: identity(otherId),
    userId,
    otherId,
  };
}

describe("private jobs", () => {
  it("creates, edits and tracks an external job without changing its history or shared discovery", async () => {
    const { t, user, other } = await setup();
    const jobId = await user.mutation(api.privateJobs.create, {
      ...details,
      title: "  Engineer  ",
      status: "saved",
      note: "Found through a friend",
    });
    await user.mutation(api.privateJobs.addNote, {
      jobId,
      note: "Contact recruiter",
    });
    await user.mutation(api.privateJobs.updateTracking, {
      jobId,
      status: "interview",
      note: "Tuesday",
    });
    await user.mutation(api.privateJobs.update, {
      ...details,
      jobId,
      title: "Senior Engineer",
      sourceUrl: "https://example.com/job?ref=friend",
    });
    const mine = await user.query(api.privateJobs.listMine, page);
    expect(mine.page).toMatchObject([
      { title: "Senior Engineer", status: "interview" },
    ]);
    const events = await user.query(api.privateJobs.timeline, { jobId });
    expect(events).toHaveLength(3);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "note", note: "Contact recruiter" }),
        expect.objectContaining({
          kind: "status_change",
          status: "saved",
          note: "Found through a friend",
        }),
        expect.objectContaining({
          kind: "status_change",
          status: "interview",
          note: "Tuesday",
        }),
      ]),
    );
    expect((await other.query(api.privateJobs.listMine, page)).page).toEqual(
      [],
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jobs").collect()).toEqual([]);
      expect(await ctx.db.query("jobSources").collect()).toEqual([]);
      expect(await ctx.db.query("jobApplications").collect()).toEqual([]);
    });
  });

  it("rejects anonymous and other-user access across every operation", async () => {
    const { t, user, other } = await setup();
    const jobId = await user.mutation(api.privateJobs.create, {
      ...details,
      status: "saved",
    });
    for (const caller of [t, other]) {
      await expect(
        caller.query(api.privateJobs.timeline, { jobId }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.privateJobs.update, { ...details, jobId }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.privateJobs.addNote, { jobId, note: "intrusion" }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.privateJobs.updateTracking, {
          jobId,
          status: "rejected",
        }),
      ).rejects.toThrow();
      await expect(
        caller.mutation(api.privateJobs.remove, { jobId }),
      ).rejects.toThrow();
    }
    await expect(t.query(api.privateJobs.listMine, page)).rejects.toThrow();
    await expect(
      t.mutation(api.privateJobs.create, { ...details, status: "saved" }),
    ).rejects.toThrow();
    expect(
      (await user.query(api.privateJobs.listMine, page)).page[0].status,
    ).toBe("saved");
  });

  it("requires status and valid bounded fields, with no partial writes on failure", async () => {
    const { user } = await setup();
    const jobId = await user.mutation(api.privateJobs.create, {
      ...details,
      status: "saved",
    });
    await expect(
      user.mutation(api.privateJobs.updateTracking, {
        jobId,
        status: null as never,
      }),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.privateJobs.updateTracking, { jobId } as never),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.jobDiscovery.removeJobTracking, {
        jobId: jobId as never,
      }),
    ).rejects.toThrow();
    for (const sourceUrl of [
      "javascript:alert(1)",
      "data:text/html,test",
      "https://user:password@example.com",
      "not a link",
    ]) {
      await expect(
        user.mutation(api.privateJobs.update, { ...details, jobId, sourceUrl }),
      ).rejects.toThrow("INVALID_JOB_URL");
    }
    for (const bad of [
      { title: " " },
      { companyName: " " },
      { descriptionText: "x".repeat(10_001) },
    ]) {
      await expect(
        user.mutation(api.privateJobs.create, {
          ...details,
          ...bad,
          status: "saved",
        }),
      ).rejects.toThrow();
    }
    await expect(
      user.mutation(api.privateJobs.addNote, { jobId, note: " " }),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.privateJobs.updateTracking, {
        jobId,
        status: "offer",
        note: "x".repeat(3_001),
      }),
    ).rejects.toThrow();
    expect(
      (await user.query(api.privateJobs.listMine, page)).page,
    ).toMatchObject([{ status: "saved", sourceUrl: "" }]);
    expect(await user.query(api.privateJobs.timeline, { jobId })).toHaveLength(
      1,
    );
  });

  it("paginates jobs past the first page and deletes large histories in batches", async () => {
    const { t, user, userId } = await setup();
    const jobId = await user.mutation(api.privateJobs.create, {
      ...details,
      status: "saved",
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 25; index++)
        await ctx.db.insert("privateJobs", {
          ...details,
          userId,
          status: "saved",
          updatedAt: index,
        });
      for (let index = 0; index < 205; index++)
        await ctx.db.insert("privateJobEvents", {
          userId,
          jobId,
          kind: "note",
          note: "A note",
          createdAt: index,
        });
    });
    const first = await user.query(api.privateJobs.listMine, page);
    const next = await user.query(api.privateJobs.listMine, {
      paginationOpts: { cursor: first.continueCursor, numItems: 20 },
    });
    expect(first.page.length + next.page.length).toBe(26);
    expect(first.isDone).toBe(false);
    expect(next.isDone).toBe(true);
    expect(await user.query(api.privateJobs.timeline, { jobId })).toHaveLength(
      100,
    );
    await user.mutation(api.privateJobs.remove, { jobId });
    expect(await user.query(api.privateJobs.timeline, { jobId })).toEqual([]);
    vi.useFakeTimers();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      expect(await ctx.db.get("privateJobs", jobId)).toBeNull();
      expect(await ctx.db.query("privateJobEvents").collect()).toEqual([]);
      expect(await ctx.db.query("privateJobs").collect()).toHaveLength(25);
    });
  });

  it("blocks writes during account deletion and removes only that owner's jobs and notes", async () => {
    const { t, user, other } = await setup();
    const jobId = await user.mutation(api.privateJobs.create, {
      ...details,
      status: "saved",
    });
    const otherJobId = await other.mutation(api.privateJobs.create, {
      ...details,
      status: "saved",
    });
    await user.mutation(api.accountData.deleteMine, { confirmation: "DELETE" });
    await expect(
      user.mutation(api.privateJobs.create, { ...details, status: "saved" }),
    ).rejects.toThrow("ACCOUNT_DELETING");
    await expect(
      user.mutation(api.privateJobs.addNote, { jobId, note: "late write" }),
    ).rejects.toThrow("ACCOUNT_DELETING");
    vi.useFakeTimers();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      expect(await ctx.db.get("privateJobs", jobId)).toBeNull();
      expect(await ctx.db.query("privateJobEvents").collect()).toMatchObject([
        { jobId: otherJobId },
      ]);
    });
    expect(
      (await other.query(api.privateJobs.listMine, page)).page,
    ).toHaveLength(1);
  });
});

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import schema, { applicationStatus, privateJobDetails } from "./schema";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId || !(await ctx.db.get("users", userId))) {
    throw new ConvexError({ code: "UNAUTHENTICATED" });
  }
  const deletion = await ctx.db
    .query("accountDeletionJobs")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (deletion) throw new ConvexError({ code: "ACCOUNT_DELETING" });
  return userId;
}

async function requireJob(
  ctx: QueryCtx | MutationCtx,
  jobId: Id<"privateJobs">,
) {
  const userId = await requireUser(ctx);
  const job = await ctx.db.get("privateJobs", jobId);
  if (!job || job.userId !== userId) {
    throw new ConvexError({ code: "JOB_NOT_FOUND" });
  }
  return job;
}

function textField(value: string, maxLength: number, required = false) {
  const text = value.trim();
  if ((required && !text) || text.length > maxLength) {
    throw new ConvexError({ code: "INVALID_PRIVATE_JOB" });
  }
  return text;
}

function details(input: {
  title: string;
  companyName: string;
  locationText: string;
  sourceUrl: string;
  descriptionText: string;
}) {
  const sourceUrl = textField(input.sourceUrl, 2_000);
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new ConvexError({ code: "INVALID_JOB_URL" });
    }
  }
  return {
    title: textField(input.title, 200, true),
    companyName: textField(input.companyName, 200, true),
    locationText: textField(input.locationText, 300),
    sourceUrl,
    descriptionText: textField(input.descriptionText, 10_000),
  };
}

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("privateJobs")),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("privateJobs")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const create = mutation({
  args: {
    ...privateJobDetails.fields,
    status: applicationStatus,
    note: v.optional(v.string()),
  },
  returns: v.id("privateJobs"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const note =
      args.note === undefined ? undefined : textField(args.note, 3_000);
    const now = Date.now();
    const jobId = await ctx.db.insert("privateJobs", {
      ...details(args),
      userId,
      status: args.status,
      updatedAt: now,
    });
    await ctx.db.insert("privateJobEvents", {
      userId,
      jobId,
      kind: "status_change",
      status: args.status,
      ...(note ? { note } : {}),
      createdAt: now,
    });
    return jobId;
  },
});

export const update = mutation({
  args: { jobId: v.id("privateJobs"), ...privateJobDetails.fields },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireJob(ctx, args.jobId);
    await ctx.db.patch("privateJobs", args.jobId, {
      ...details(args),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateTracking = mutation({
  args: {
    jobId: v.id("privateJobs"),
    status: applicationStatus,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const note =
      args.note === undefined ? undefined : textField(args.note, 3_000);
    if (job.status === args.status) return null;
    const now = Date.now();
    await ctx.db.patch("privateJobs", job._id, {
      status: args.status,
      updatedAt: now,
    });
    await ctx.db.insert("privateJobEvents", {
      userId: job.userId,
      jobId: job._id,
      kind: "status_change",
      status: args.status,
      ...(note ? { note } : {}),
      createdAt: now,
    });
    return null;
  },
});

export const addNote = mutation({
  args: { jobId: v.id("privateJobs"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const note = textField(args.note, 3_000, true);
    const now = Date.now();
    await ctx.db.insert("privateJobEvents", {
      userId: job.userId,
      jobId: job._id,
      kind: "note",
      note,
      createdAt: now,
    });
    await ctx.db.patch("privateJobs", job._id, { updatedAt: now });
    return null;
  },
});

export const timeline = query({
  args: { jobId: v.id("privateJobs") },
  returns: v.array(schema.doc("privateJobEvents")),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const job = await ctx.db.get("privateJobs", args.jobId);
    // An exiting card may remain subscribed briefly after deletion.
    if (!job) return [];
    if (job.userId !== userId) throw new ConvexError({ code: "JOB_NOT_FOUND" });
    return await ctx.db
      .query("privateJobEvents")
      .withIndex("by_jobId_and_createdAt", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .take(100);
  },
});

export const remove = mutation({
  args: { jobId: v.id("privateJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireJob(ctx, args.jobId);
    await ctx.db.delete("privateJobs", args.jobId);
    await ctx.scheduler.runAfter(0, internal.privateJobs.deleteEvents, args);
    return null;
  },
});

export const deleteEvents = internalMutation({
  args: { jobId: v.id("privateJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("privateJobEvents")
      .withIndex("by_jobId_and_createdAt", (q) => q.eq("jobId", args.jobId))
      .take(100);
    await Promise.all(
      events.map((event) => ctx.db.delete("privateJobEvents", event._id)),
    );
    if (events.length === 100)
      await ctx.scheduler.runAfter(0, internal.privateJobs.deleteEvents, args);
    return null;
  },
});

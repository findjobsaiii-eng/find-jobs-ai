import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { productEventName } from "./schema";

const HOUR_MS = 60 * 60 * 1_000;
const FEED_VIEW_DEDUPE_MS = 30 * 60 * 1_000;

export type ProductEventName =
  | "app_visited"
  | "job_feed_viewed"
  | "job_source_clicked"
  | "job_saved"
  | "application_status_changed"
  | "application_tracking_removed"
  | "profile_saved"
  | "onboarding_completed"
  | "resume_uploaded"
  | "deep_review_requested"
  | "email_preference_changed";

type ProductEventInput = {
  userId: Id<"users">;
  event: ProductEventName;
  occurredAt?: number;
  jobId?: Id<"jobs">;
  applicationStatus?:
    | "saved"
    | "applied"
    | "recruiter_contact"
    | "phone_screen"
    | "interview"
    | "assignment"
    | "final_interview"
    | "offer"
    | "rejected"
    | "withdrawn";
  view?: "suggestions" | "in_progress";
  source?: "app" | "email";
  emailFrequency?: "daily" | "weekly" | "never";
  meaningful?: boolean;
};

async function loadActivity(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("userActivity")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function recordProductEvent(
  ctx: MutationCtx,
  input: ProductEventInput,
) {
  const occurredAt = input.occurredAt ?? Date.now();
  const meaningful = input.meaningful ?? input.event !== "app_visited";
  const activity = await loadActivity(ctx, input.userId);
  const event = {
    userId: input.userId,
    event: input.event,
    occurredAt,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.applicationStatus
      ? { applicationStatus: input.applicationStatus }
      : {}),
    ...(input.view ? { view: input.view } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.emailFrequency ? { emailFrequency: input.emailFrequency } : {}),
  };
  await ctx.db.insert("productEvents", event);
  if (activity) {
    await ctx.db.patch("userActivity", activity._id, {
      lastSeenAt: Math.max(activity.lastSeenAt, occurredAt),
      ...(meaningful
        ? {
            lastMeaningfulActionAt: occurredAt,
            lastMeaningfulEvent: input.event,
          }
        : {}),
    });
  } else {
    await ctx.db.insert("userActivity", {
      userId: input.userId,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
      ...(meaningful
        ? {
            lastMeaningfulActionAt: occurredAt,
            lastMeaningfulEvent: input.event,
          }
        : {}),
    });
  }
}

const clientEventName = v.union(
  v.literal("app_visited"),
  v.literal("job_feed_viewed"),
  v.literal("job_source_clicked"),
);

export const recordClientEvent = mutation({
  args: {
    event: clientEventName,
    jobId: v.optional(v.id("jobs")),
    view: v.optional(
      v.union(v.literal("suggestions"), v.literal("in_progress")),
    ),
    source: v.optional(v.union(v.literal("app"), v.literal("email"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const now = Date.now();

    if (args.event === "job_source_clicked") {
      if (!args.jobId || !(await ctx.db.get("jobs", args.jobId))) {
        throw new ConvexError({ code: "JOB_NOT_FOUND" });
      }
      const [match, application] = await Promise.all([
        ctx.db
          .query("jobMatches")
          .withIndex("by_userId_and_jobId", (q) =>
            q.eq("userId", userId).eq("jobId", args.jobId!),
          )
          .unique(),
        ctx.db
          .query("jobApplications")
          .withIndex("by_userId_and_jobId", (q) =>
            q.eq("userId", userId).eq("jobId", args.jobId!),
          )
          .unique(),
      ]);
      if (!match && !application) {
        throw new ConvexError({ code: "JOB_NOT_AVAILABLE" });
      }
    } else if (args.jobId) {
      throw new ConvexError({ code: "INVALID_ANALYTICS_EVENT" });
    }

    const activity = await loadActivity(ctx, userId);
    if (
      args.event === "app_visited" &&
      activity &&
      now - activity.lastSeenAt < HOUR_MS
    ) {
      return null;
    }
    if (args.event === "job_feed_viewed") {
      if (!args.view) {
        throw new ConvexError({ code: "INVALID_ANALYTICS_EVENT" });
      }
      const previous = await ctx.db
        .query("productEvents")
        .withIndex("by_userId_and_event_and_occurredAt", (q) =>
          q.eq("userId", userId).eq("event", "job_feed_viewed"),
        )
        .order("desc")
        .first();
      if (
        previous?.view === args.view &&
        now - previous.occurredAt < FEED_VIEW_DEDUPE_MS
      ) {
        return null;
      }
    }

    await recordProductEvent(ctx, {
      userId,
      event: args.event,
      ...(args.jobId ? { jobId: args.jobId } : {}),
      ...(args.view ? { view: args.view } : {}),
      ...(args.source ? { source: args.source } : {}),
    });
    return null;
  },
});

// Re-exported so admin return validators can share the exact event vocabulary.
export const productEventValidator = productEventName;

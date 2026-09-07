import { v } from "convex/values";
import schema from "./schema";
import { internalMutation, query, env } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import {
  deriveJobLifecycle,
  isActiveFeedLifecycle,
  JOB_ACTIVITY_POLICY,
  retryDelayMs,
} from "./jobActivityPolicy";

const verificationValidator = v.object({
  activityStatus: v.union(
    v.literal("verified_active"),
    v.literal("inactive"),
    v.literal("verification_failed"),
  ),
  finalUrl: v.union(v.string(), v.null()),
  domain: v.string(),
  sourceTier: v.union(
    v.literal("employer"),
    v.literal("ats"),
    v.literal("job_board"),
    v.literal("aggregator"),
  ),
  externalJobId: v.union(v.string(), v.null()),
  verifiedAt: v.number(),
  verificationMethod: v.literal("http_content_v1"),
  verificationEvidence: v.string(),
  rawSourceText: v.optional(v.string()),
});

function sourcePriority(source: {
  sourceTier: string;
  lastVerifiedAt?: number;
}) {
  const tier = { employer: 1, ats: 2, job_board: 3, aggregator: 4 }[
    source.sourceTier as "employer" | "ats" | "job_board" | "aggregator"
  ];
  return [tier, -(source.lastVerifiedAt ?? 0)] as const;
}

async function refreshJobLifecycle(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  now: number,
) {
  const job = await ctx.db.get("jobs", jobId);
  if (!job) return;
  const sources = await ctx.db
    .query("jobSources")
    .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
    .take(50);
  const active = sources
    .filter((source) => source.activityStatus === "verified_active")
    .sort((left, right) => {
      const a = sourcePriority(left);
      const b = sourcePriority(right);
      return a[0] - b[0] || a[1] - b[1];
    });
  const lifecycle = deriveJobLifecycle({
    sources,
    lastSeenAt: job.lastDiscoveredAt,
    applicationDeadline: job.applicationDeadline,
    now,
  });
  const best = active[0];
  await ctx.db.patch("jobs", jobId, {
    bestSourceId: best?._id,
    ...(best ? { sourceUrl: best.finalUrl ?? best.normalizedUrl } : {}),
    lastVerifiedAt: best?.lastVerifiedAt,
    lifecycleStatus: lifecycle.status,
    activityStatus: isActiveFeedLifecycle(lifecycle.status)
      ? "active"
      : lifecycle.status === "unknown"
        ? "unknown"
        : "inactive",
    activityReason: lifecycle.reason,
    closedAt: lifecycle.closedAt,
  });
}

export const claimDueSources = internalMutation({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      source: schema.doc("jobSources"),
      job: schema.doc("jobs"),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const due = await ctx.db
      .query("jobSources")
      .withIndex("by_nextVerificationAt", (q) =>
        q.lt("nextVerificationAt", now + 1),
      )
      .take(Math.min(Math.max(Math.floor(args.limit), 1), 50));
    const claimed = [];
    for (const source of due) {
      if ((source.verificationLeaseUntil ?? 0) > now) continue;
      const job = await ctx.db.get("jobs", source.jobId);
      if (!job || job.canonicalJobId) continue;
      await ctx.db.patch("jobSources", source._id, {
        verificationLeaseUntil: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
      });
      claimed.push({
        source: {
          ...source,
          verificationLeaseUntil: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
        },
        job,
      });
    }
    return claimed;
  },
});

export const recordVerification = internalMutation({
  args: {
    sourceId: v.id("jobSources"),
    verification: verificationValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("jobSources", args.sourceId);
    if (!source) return null;
    const now = args.verification.verifiedAt;
    if (args.verification.activityStatus === "verification_failed") {
      const failureCount = (source.verificationFailureCount ?? 0) + 1;
      await ctx.db.patch("jobSources", source._id, {
        lastVerificationAttemptAt: now,
        nextVerificationAt: now + retryDelayMs(failureCount),
        verificationFailureCount: failureCount,
        verificationLeaseUntil: undefined,
        verificationMethod: args.verification.verificationMethod,
        verificationEvidence: args.verification.verificationEvidence,
      });
    } else {
      const closed = args.verification.activityStatus === "inactive";
      await ctx.db.patch("jobSources", source._id, {
        finalUrl: args.verification.finalUrl ?? source.finalUrl,
        domain: args.verification.domain,
        sourceTier: args.verification.sourceTier,
        externalJobId: args.verification.externalJobId ?? undefined,
        providerKey: args.verification.externalJobId
          ? `${args.verification.domain}:${args.verification.externalJobId}`
          : undefined,
        lastVerifiedAt: now,
        lastVerificationAttemptAt: now,
        nextVerificationAt: now + JOB_ACTIVITY_POLICY.activeVerificationTtlMs,
        verificationFailureCount: 0,
        verificationLeaseUntil: undefined,
        activityStatus: args.verification.activityStatus,
        verificationMethod: args.verification.verificationMethod,
        verificationEvidence: args.verification.verificationEvidence,
        rawSourceText: args.verification.rawSourceText,
        closedAt: closed ? now : undefined,
        closureReason: closed
          ? args.verification.verificationEvidence
          : undefined,
      });
    }
    await refreshJobLifecycle(ctx, source.jobId, now);
    return null;
  },
});

export const getDiagnostics = query({
  args: { jobId: v.id("jobs") },
  returns: v.object({
    canonicalJobId: v.id("jobs"),
    sourceCount: v.number(),
    lastSeenAt: v.number(),
    lastVerifiedAt: v.union(v.number(), v.null()),
    lifecycleStatus: v.string(),
    activityStatus: v.string(),
    reason: v.union(v.string(), v.null()),
    sources: v.array(
      v.object({
        sourceUrl: v.string(),
        sourceTier: v.string(),
        providerKey: v.union(v.string(), v.null()),
        lastSeenAt: v.number(),
        lastVerifiedAt: v.union(v.number(), v.null()),
        activityStatus: v.string(),
        mergeReason: v.union(v.string(), v.null()),
        closureReason: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    const requested = await ctx.db.get("jobs", args.jobId);
    if (!requested) throw new ConvexError({ code: "JOB_NOT_FOUND" });
    const canonicalJobId = requested.canonicalJobId ?? requested._id;
    const job = await ctx.db.get("jobs", canonicalJobId);
    if (!job) throw new ConvexError({ code: "JOB_NOT_FOUND" });
    const sources = await ctx.db
      .query("jobSources")
      .withIndex("by_jobId", (q) => q.eq("jobId", canonicalJobId))
      .take(100);
    return {
      canonicalJobId,
      sourceCount: sources.length,
      lastSeenAt: Math.max(
        job.lastDiscoveredAt,
        ...sources.map((s) => s.lastSeenAt),
      ),
      lastVerifiedAt: job.lastVerifiedAt ?? null,
      lifecycleStatus: job.lifecycleStatus ?? "unknown",
      activityStatus: job.activityStatus,
      reason: job.activityReason ?? job.duplicateReason ?? null,
      sources: sources.map((source) => ({
        sourceUrl: source.finalUrl ?? source.normalizedUrl,
        sourceTier: source.sourceTier,
        providerKey: source.providerKey ?? null,
        lastSeenAt: source.lastSeenAt,
        lastVerifiedAt: source.lastVerifiedAt ?? null,
        activityStatus: source.activityStatus,
        mergeReason: source.duplicateReason ?? null,
        closureReason: source.closureReason ?? null,
      })),
    };
  },
});

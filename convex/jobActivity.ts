import { v } from "convex/values";
import schema from "./schema";
import {
  internalMutation,
  internalQuery,
  query,
  env,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizePublicUrl } from "./jobDiscoveryModel";
import { classifyJobSource, preferredSourceSortKey } from "./jobSourceQuality";
import {
  classifyFreshness,
  normalizeDiscoveredPostingDate,
  selectOriginalPostingDate,
  type DatePostedProvenance,
} from "./jobFreshness";
import { rememberVerifiedCompanySource } from "./companySourceMemory";
import {
  isDevelopmentFixtureJob,
  isUserFacingJobSource,
} from "./jobSourceProvenance";
import {
  activityReasonForLifecycle,
  deriveJobLifecycle,
  isFreshActiveSource,
  isActiveFeedLifecycle,
  JOB_ACTIVITY_POLICY,
  retryDelayMs,
} from "./jobActivityPolicy";

const verificationValidator = v.object({
  activityStatus: v.union(
    v.literal("verified_active"),
    v.literal("unknown"),
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
  verificationMethod: v.union(
    v.literal("http_content_v1"),
    v.literal("http_content_v2"),
  ),
  verificationEvidence: v.string(),
  activeEvidenceType: v.union(v.string(), v.null()),
  identityMatched: v.boolean(),
  applicationAvailable: v.boolean(),
  applicationUrl: v.optional(v.union(v.string(), v.null())),
  structuredDatePosted: v.union(v.string(), v.null()),
  datePosted: v.optional(v.union(v.string(), v.null())),
  datePostedProvenance: v.optional(
    v.union(
      v.literal("employer_ats_structured"),
      v.literal("jobposting_jsonld"),
      v.literal("provider_structured"),
      v.literal("page_explicit"),
      v.literal("discovery_metadata"),
      v.null(),
    ),
  ),
  structuredValidThrough: v.union(v.string(), v.null()),
  structuredJobIdentifier: v.union(v.string(), v.null()),
  pageTitle: v.union(v.string(), v.null()),
  redirected: v.boolean(),
  rawSourceText: v.optional(v.string()),
  httpStatus: v.optional(v.number()),
});

function storedSourceUrls(job: Doc<"jobs">) {
  const urls = new Map<string, string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = normalizePublicUrl(value);
    if (normalized && !urls.has(normalized)) urls.set(normalized, value);
  };
  add(job.sourceUrl);
  add(job.normalizedSourceUrl);
  for (const evidence of job.sourceEvidence) add(evidence.url);
  if (job.rawProviderJson) {
    try {
      const queue: unknown[] = [JSON.parse(job.rawProviderJson)];
      for (let index = 0; index < queue.length && index < 200; index += 1) {
        const value = queue[index];
        if (typeof value === "string") add(value);
        else if (Array.isArray(value)) queue.push(...value.slice(0, 50));
        else if (value && typeof value === "object") {
          queue.push(...Object.values(value).slice(0, 50));
        }
      }
    } catch {
      // Malformed historical payloads are not a reason to invent a URL.
    }
  }
  return [...urls.entries()].slice(0, 10);
}

function recoveredSourceTier(job: Doc<"jobs">, normalizedUrl: string) {
  const hostname = new URL(normalizedUrl).hostname.toLocaleLowerCase("en-US");
  const declared =
    normalizedUrl === job.normalizedSourceUrl ? job.sourceType : undefined;
  return classifyJobSource(hostname, declared).sourceTier;
}

function sourcePriority(source: {
  sourceTier: string;
  applicationUrl?: string;
  lastVerifiedAt?: number;
}) {
  return preferredSourceSortKey({
    applicationUrl: source.applicationUrl,
    sourceTier: source.sourceTier as
      "employer" | "ats" | "job_board" | "aggregator",
    lastVerifiedAt: source.lastVerifiedAt,
  });
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
    .filter((source) => isFreshActiveSource(source, now))
    .sort((left, right) => {
      const a = sourcePriority(left);
      const b = sourcePriority(right);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
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
    activityReason: activityReasonForLifecycle({
      lifecycle,
      sources,
      bestSource: best,
    }),
    closedAt: lifecycle.closedAt,
  });
  await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileJobUsers, {
    jobId,
    cursor: null,
  });
}

export const backfillMissingSourceRecords = internalMutation({
  args: { limit: v.number() },
  returns: v.object({
    scanned: v.number(),
    recoveredJobs: v.number(),
    recoveredSources: v.number(),
    unverifiableJobs: v.number(),
    provenanceUpdated: v.number(),
    pendingFailuresReclassified: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 25);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
      .take(250);
    const now = Date.now();
    let scanned = 0;
    let recoveredJobs = 0;
    let recoveredSources = 0;
    let unverifiableJobs = 0;
    let provenanceUpdated = 0;
    let pendingFailuresReclassified = 0;
    for (const job of jobs) {
      if (job.canonicalJobId || recoveredJobs + unverifiableJobs >= limit) {
        continue;
      }
      scanned += 1;
      const currentSources = await ctx.db
        .query("jobSources")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .take(50);
      if (currentSources.length) {
        for (const source of currentSources) {
          if (
            source.activityStatus === "pending_verification" &&
            source.lastVerificationAttemptAt !== undefined
          ) {
            await ctx.db.patch("jobSources", source._id, {
              activityStatus: "verification_failed",
            });
            source.activityStatus = "verification_failed";
            pendingFailuresReclassified += 1;
          }
        }
        const lifecycle = deriveJobLifecycle({
          sources: currentSources,
          lastSeenAt: job.lastDiscoveredAt,
          applicationDeadline: job.applicationDeadline,
          now,
        });
        const best = job.bestSourceId
          ? currentSources.find((source) => source._id === job.bestSourceId)
          : undefined;
        const reason = activityReasonForLifecycle({
          lifecycle,
          sources: currentSources,
          bestSource: best,
        });
        if (reason !== job.activityReason) {
          await ctx.db.patch("jobs", job._id, { activityReason: reason });
          provenanceUpdated += 1;
        }
        continue;
      }
      const recovered = storedSourceUrls(job);
      if (!recovered.length) {
        if (
          job.lifecycleStatus !== "closed" &&
          job.lifecycleStatus !== "expired"
        ) {
          await ctx.db.patch("jobs", job._id, {
            lifecycleStatus: "unknown",
            activityStatus: "unknown",
            activityReason: "unverifiable_source",
            bestSourceId: undefined,
            lastVerifiedAt: undefined,
          });
        }
        unverifiableJobs += 1;
        continue;
      }
      let insertedForJob = 0;
      for (const [normalizedUrl, sourceUrl] of recovered) {
        const existing = await ctx.db
          .query("jobSources")
          .withIndex("by_normalizedUrl", (q) =>
            q.eq("normalizedUrl", normalizedUrl),
          )
          .first();
        if (existing) continue;
        await ctx.db.insert("jobSources", {
          jobId: job._id,
          sourceName:
            normalizedUrl === job.normalizedSourceUrl ? job.sourceName : null,
          sourceUrl,
          normalizedUrl,
          domain: new URL(normalizedUrl).hostname.toLocaleLowerCase("en-US"),
          sourceTier: recoveredSourceTier(job, normalizedUrl),
          firstSeenAt: job.firstDiscoveredAt,
          lastSeenAt: job.lastDiscoveredAt,
          nextVerificationAt:
            job.lifecycleStatus === "closed" ||
            job.lifecycleStatus === "expired"
              ? undefined
              : now,
          verificationFailureCount: 0,
          activityStatus: "pending_verification",
          verificationEvidence: "recovered_stored_source_unverified",
        });
        insertedForJob += 1;
        recoveredSources += 1;
      }
      if (!insertedForJob) {
        if (
          job.lifecycleStatus !== "closed" &&
          job.lifecycleStatus !== "expired"
        ) {
          await ctx.db.patch("jobs", job._id, {
            lifecycleStatus: "unknown",
            activityStatus: "unknown",
            activityReason: "unverifiable_source",
            bestSourceId: undefined,
            lastVerifiedAt: undefined,
          });
        }
        unverifiableJobs += 1;
        continue;
      }
      recoveredJobs += 1;
      if (
        job.lifecycleStatus !== "closed" &&
        job.lifecycleStatus !== "expired"
      ) {
        await ctx.db.patch("jobs", job._id, {
          lifecycleStatus: "unknown",
          activityStatus: "unknown",
          activityReason: "provider_recently_seen_unverified",
          bestSourceId: undefined,
          lastVerifiedAt: undefined,
          closedAt: undefined,
        });
      }
    }
    if (recoveredSources > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.jobActivityActions.verifyDueSources,
        {},
      );
    }
    return {
      scanned,
      recoveredJobs,
      recoveredSources,
      unverifiableJobs,
      provenanceUpdated,
      pendingFailuresReclassified,
    };
  },
});

/** Removes only records carrying the explicit development-fixture provenance. */
export const removeKnownDevelopmentFixtures = internalMutation({
  args: {},
  returns: v.object({
    fixtureJobs: v.number(),
    deletedJobs: v.number(),
    deletedSources: v.number(),
    deletedMatches: v.number(),
    skippedWithHistory: v.number(),
  }),
  handler: async (ctx) => {
    const [sources, applications, reviews, matches] = await Promise.all([
      ctx.db.query("jobSources").withIndex("by_nextVerificationAt").take(2_001),
      ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_appliedAt")
        .take(1_001),
      ctx.db
        .query("jobDeepReviews")
        .withIndex("by_userId_and_updatedAt")
        .take(1_001),
      ctx.db.query("jobMatches").withIndex("by_searchRunId").take(2_001),
    ]);
    if (
      sources.length > 2_000 ||
      applications.length > 1_000 ||
      reviews.length > 1_000 ||
      matches.length > 2_000
    ) {
      throw new Error("FIXTURE_CLEANUP_SCAN_LIMIT");
    }
    const fixtureSources = sources.filter(
      (source) => !isUserFacingJobSource(source),
    );
    const fixtureJobIds = [
      ...new Set(fixtureSources.map((source) => source.jobId)),
    ];
    let deletedJobs = 0;
    let deletedSources = 0;
    let deletedMatches = 0;
    let skippedWithHistory = 0;
    for (const jobId of fixtureJobIds) {
      const jobSources = sources.filter((source) => source.jobId === jobId);
      const hasRealSource = jobSources.some(isUserFacingJobSource);
      const hasHistory =
        applications.some((application) => application.jobId === jobId) ||
        reviews.some((review) => review.jobId === jobId);
      if (hasRealSource || hasHistory) {
        skippedWithHistory += 1;
        continue;
      }
      for (const match of matches.filter((item) => item.jobId === jobId)) {
        await ctx.db.delete("jobMatches", match._id);
        deletedMatches += 1;
      }
      const discoveries = await ctx.db
        .query("jobDiscoveries")
        .withIndex("by_jobId_and_userId", (q) => q.eq("jobId", jobId))
        .take(200);
      for (const discovery of discoveries) {
        await ctx.db.delete("jobDiscoveries", discovery._id);
      }
      const events = await ctx.db
        .query("jobIngestionEvents")
        .withIndex("by_jobId_and_observedAt", (q) => q.eq("jobId", jobId))
        .take(200);
      for (const event of events) {
        await ctx.db.delete("jobIngestionEvents", event._id);
      }
      for (const source of jobSources) {
        await ctx.db.delete("jobSources", source._id);
        deletedSources += 1;
      }
      const job = await ctx.db.get("jobs", jobId);
      if (job && isDevelopmentFixtureJob(job)) {
        await ctx.db.delete("jobs", jobId);
        deletedJobs += 1;
      }
    }
    return {
      fixtureJobs: fixtureJobIds.length,
      deletedJobs,
      deletedSources,
      deletedMatches,
      skippedWithHistory,
    };
  },
});

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
      .take(200);
    const hydrated = await Promise.all(
      due.map(async (source) => ({
        source,
        job: await ctx.db.get("jobs", source.jobId),
      })),
    );
    hydrated.sort((left, right) => {
      const leftVisible = isActiveFeedLifecycle(left.job?.lifecycleStatus)
        ? 0
        : 1;
      const rightVisible = isActiveFeedLifecycle(right.job?.lifecycleStatus)
        ? 0
        : 1;
      const leftWeak = left.source.activeEvidenceType ? 1 : 0;
      const rightWeak = right.source.activeEvidenceType ? 1 : 0;
      return (
        leftVisible - rightVisible ||
        leftWeak - rightWeak ||
        left.source.lastSeenAt - right.source.lastSeenAt ||
        (left.source.nextVerificationAt ?? 0) -
          (right.source.nextVerificationAt ?? 0)
      );
    });
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 50);
    const claimed = [];
    for (const { source, job } of hydrated) {
      if (claimed.length >= limit) break;
      if ((source.verificationLeaseUntil ?? 0) > now) continue;
      if (!job || job.canonicalJobId) {
        await ctx.db.patch("jobSources", source._id, {
          nextVerificationAt: now + JOB_ACTIVITY_POLICY.maxRetryBackoffMs,
        });
        continue;
      }
      await ctx.db.patch("jobSources", source._id, {
        verificationLeaseUntil: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
        nextVerificationAt: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
      });
      claimed.push({
        source: {
          ...source,
          verificationLeaseUntil: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
          nextVerificationAt: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
        },
        job,
      });
    }
    return claimed;
  },
});

/** Bounded internal recheck used to diagnose specific source false negatives. */
export const claimSpecificSources = internalMutation({
  args: { sourceIds: v.array(v.id("jobSources")) },
  returns: v.array(
    v.object({ source: schema.doc("jobSources"), job: schema.doc("jobs") }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const claimed = [];
    for (const sourceId of [...new Set(args.sourceIds)].slice(0, 10)) {
      const source = await ctx.db.get("jobSources", sourceId);
      if (!source || !isUserFacingJobSource(source)) continue;
      const job = await ctx.db.get("jobs", source.jobId);
      if (!job || job.canonicalJobId || isDevelopmentFixtureJob(job)) continue;
      await ctx.db.patch("jobSources", source._id, {
        verificationLeaseUntil: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
        nextVerificationAt: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
      });
      claimed.push({ source, job });
    }
    return claimed;
  },
});

export const claimVisibleSourcesForEvidenceRecheck = internalMutation({
  args: { limit: v.number() },
  returns: v.object({
    eligibleBefore: v.number(),
    claimed: v.array(
      v.object({
        job: schema.doc("jobs"),
        sources: v.array(schema.doc("jobSources")),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const [active, probablyActive] = await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt", (q) =>
          q.eq("lifecycleStatus", "verified_active"),
        )
        .take(100),
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt", (q) =>
          q.eq("lifecycleStatus", "probably_active"),
        )
        .take(100),
    ]);
    const candidates = [...active, ...probablyActive].filter(
      (job) =>
        !job.canonicalJobId &&
        !isDevelopmentFixtureJob(job) &&
        Boolean(job.bestSourceId),
    );
    candidates.sort((left, right) => {
      const leftPosted = left.postedAt ? Date.parse(left.postedAt) : NaN;
      const rightPosted = right.postedAt ? Date.parse(right.postedAt) : NaN;
      const leftAgeKey = Number.isFinite(leftPosted) ? leftPosted : 0;
      const rightAgeKey = Number.isFinite(rightPosted) ? rightPosted : 0;
      return (
        leftAgeKey - rightAgeKey ||
        left.lastDiscoveredAt - right.lastDiscoveredAt
      );
    });
    const claimed = [];
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 40);
    for (const job of candidates.slice(0, limit)) {
      const sources = (
        await ctx.db
          .query("jobSources")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .take(10)
      ).filter(isUserFacingJobSource);
      sources.sort((left, right) => {
        if (left._id === job.bestSourceId) return -1;
        if (right._id === job.bestSourceId) return 1;
        return sourcePriority(left)[0] - sourcePriority(right)[0];
      });
      if (!sources.length) continue;
      for (const source of sources) {
        await ctx.db.patch("jobSources", source._id, {
          verificationLeaseUntil: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
          nextVerificationAt: now + JOB_ACTIVITY_POLICY.verificationLeaseMs,
        });
      }
      claimed.push({ job, sources });
    }
    return { eligibleBefore: candidates.length, claimed };
  },
});

export const getLifecycleCountsForJobs = internalQuery({
  args: { jobIds: v.array(v.id("jobs")) },
  returns: v.object({
    eligible: v.number(),
    unknown: v.number(),
    closed: v.number(),
    expired: v.number(),
  }),
  handler: async (ctx, args) => {
    const jobs = await Promise.all(
      args.jobIds.slice(0, 40).map((jobId) => ctx.db.get("jobs", jobId)),
    );
    return {
      eligible: jobs.filter((job) =>
        isActiveFeedLifecycle(job?.lifecycleStatus),
      ).length,
      unknown: jobs.filter((job) => job?.lifecycleStatus === "unknown").length,
      closed: jobs.filter((job) => job?.lifecycleStatus === "closed").length,
      expired: jobs.filter((job) => job?.lifecycleStatus === "expired").length,
    };
  },
});

export const demoteLegacyHttpOnlySources = internalMutation({
  args: { limit: v.number() },
  returns: v.object({
    sourcesDemoted: v.number(),
    jobsRecalculated: v.number(),
  }),
  handler: async (ctx, args) => {
    const sources = await ctx.db
      .query("jobSources")
      .withIndex("by_nextVerificationAt")
      .take(Math.min(Math.max(Math.floor(args.limit), 1), 200));
    const jobIds = new Set<Id<"jobs">>();
    let sourcesDemoted = 0;
    for (const source of sources) {
      if (
        source.activityStatus !== "verified_active" ||
        source.activeEvidenceType !== undefined ||
        !isUserFacingJobSource(source)
      ) {
        continue;
      }
      await ctx.db.patch("jobSources", source._id, {
        activityStatus: "unknown",
      });
      jobIds.add(source.jobId);
      sourcesDemoted += 1;
    }
    const now = Date.now();
    for (const jobId of jobIds) await refreshJobLifecycle(ctx, jobId, now);
    return { sourcesDemoted, jobsRecalculated: jobIds.size };
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
    if ((source.lastVerificationAttemptAt ?? 0) > now) return null;
    if (args.verification.activityStatus === "verification_failed") {
      const failureCount = (source.verificationFailureCount ?? 0) + 1;
      await ctx.db.patch("jobSources", source._id, {
        lastVerificationAttemptAt: now,
        lastVerificationHttpStatus: args.verification.httpStatus,
        nextVerificationAt: now + retryDelayMs(failureCount),
        verificationFailureCount: failureCount,
        verificationLeaseUntil: undefined,
        verificationMethod: args.verification.verificationMethod,
        verificationEvidence: args.verification.verificationEvidence,
        activityStatus:
          source.activeEvidenceType !== undefined
            ? source.activityStatus
            : "unknown",
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
        lastVerificationHttpStatus: args.verification.httpStatus,
        nextVerificationAt: now + JOB_ACTIVITY_POLICY.activeVerificationTtlMs,
        verificationFailureCount: 0,
        verificationLeaseUntil: undefined,
        activityStatus: args.verification.activityStatus,
        verificationMethod: args.verification.verificationMethod,
        verificationEvidence: args.verification.verificationEvidence,
        activeEvidenceType: args.verification.activeEvidenceType ?? undefined,
        identityMatched: args.verification.identityMatched,
        applicationAvailable: args.verification.applicationAvailable,
        applicationUrl: args.verification.applicationUrl ?? undefined,
        structuredDatePosted:
          args.verification.structuredDatePosted ?? undefined,
        datePosted: args.verification.datePosted ?? undefined,
        datePostedProvenance:
          args.verification.datePostedProvenance ?? undefined,
        structuredValidThrough:
          args.verification.structuredValidThrough ?? undefined,
        structuredJobIdentifier:
          args.verification.structuredJobIdentifier ?? undefined,
        pageTitle: args.verification.pageTitle ?? undefined,
        redirected: args.verification.redirected,
        rawSourceText: args.verification.rawSourceText,
        closedAt: closed ? now : undefined,
        closureReason: closed
          ? args.verification.verificationEvidence
          : undefined,
      });
    }
    if (args.verification.datePosted) {
      const job = await ctx.db.get("jobs", source.jobId);
      if (job) {
        const selected = selectOriginalPostingDate(job, {
          postedAt: args.verification.datePosted,
          datePostedProvenance:
            args.verification.datePostedProvenance ?? undefined,
        });
        if (
          selected.postedAt !== job.postedAt ||
          selected.datePostedProvenance !== job.datePostedProvenance
        ) {
          await ctx.db.patch("jobs", job._id, {
            postedAt: selected.postedAt ?? null,
            datePostedProvenance: selected.datePostedProvenance,
          });
        }
      }
    }
    await refreshJobLifecycle(ctx, source.jobId, now);
    const [job, updatedSource] = await Promise.all([
      ctx.db.get("jobs", source.jobId),
      ctx.db.get("jobSources", source._id),
    ]);
    if (job && updatedSource) {
      await rememberVerifiedCompanySource(ctx, { job, source: updatedSource });
    }
    return null;
  },
});

export const backfillDatePostedProvenance = internalMutation({
  args: { limit: v.number() },
  returns: v.object({ scanned: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
      .take(Math.min(Math.max(Math.floor(args.limit), 1), 200));
    let updated = 0;
    for (const job of jobs) {
      if (job.canonicalJobId || isDevelopmentFixtureJob(job)) continue;
      const sources = await ctx.db
        .query("jobSources")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .take(50);
      let originallyDiscoveredPostedAt = job.postedAt;
      if (
        job.datePostedProvenance === "discovery_metadata" &&
        job.rawProviderJson
      ) {
        try {
          const raw = JSON.parse(job.rawProviderJson) as {
            postedAt?: unknown;
          };
          if (typeof raw.postedAt === "string") {
            originallyDiscoveredPostedAt = raw.postedAt;
          }
        } catch {
          // Keep the stored value when historical provider JSON is malformed.
        }
      }
      const normalizedExisting = normalizeDiscoveredPostingDate(
        originallyDiscoveredPostedAt,
        job.firstDiscoveredAt,
      );
      let selected: {
        postedAt?: string | null;
        datePostedProvenance?: DatePostedProvenance;
      } = {
        postedAt: normalizedExisting,
        datePostedProvenance:
          job.datePostedProvenance ??
          (normalizedExisting ? ("discovery_metadata" as const) : undefined),
      };
      for (const source of sources) {
        selected = selectOriginalPostingDate(selected, {
          postedAt: source.datePosted ?? source.structuredDatePosted,
          datePostedProvenance:
            source.datePostedProvenance ??
            (source.structuredDatePosted
              ? source.sourceTier === "employer" || source.sourceTier === "ats"
                ? "employer_ats_structured"
                : "jobposting_jsonld"
              : undefined),
        });
      }
      if (
        selected.postedAt === job.postedAt &&
        selected.datePostedProvenance === job.datePostedProvenance
      ) {
        continue;
      }
      await ctx.db.patch("jobs", job._id, {
        postedAt: selected.postedAt ?? null,
        datePostedProvenance: selected.datePostedProvenance,
      });
      await ctx.scheduler.runAfter(0, internal.jobMatching.reconcileJobUsers, {
        jobId: job._id,
        cursor: null,
      });
      updated += 1;
    }
    return { scanned: jobs.length, updated };
  },
});

export const getCatalogFreshnessAudit = internalQuery({
  args: { now: v.number() },
  returns: v.object({
    totalCanonical: v.number(),
    buckets: v.object({
      veryFresh: v.object({ catalog: v.number(), active: v.number() }),
      fresh: v.object({ catalog: v.number(), active: v.number() }),
      acceptable: v.object({ catalog: v.number(), active: v.number() }),
      old: v.object({ catalog: v.number(), active: v.number() }),
      stale: v.object({ catalog: v.number(), active: v.number() }),
      unknown: v.object({ catalog: v.number(), active: v.number() }),
    }),
    activeJobs: v.array(
      v.object({
        jobId: v.id("jobs"),
        title: v.string(),
        companyName: v.string(),
        postedAt: v.union(v.string(), v.null()),
        datePostedProvenance: v.union(v.string(), v.null()),
        ageDays: v.union(v.number(), v.null()),
        freshnessBucket: v.string(),
        firstSeenAt: v.number(),
        lastSeenAt: v.number(),
        lastVerifiedAt: v.union(v.number(), v.null()),
        activityState: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const [jobs, sources] = await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
        .take(1_000),
      ctx.db.query("jobSources").withIndex("by_nextVerificationAt").take(2_000),
    ]);
    const fixtureJobIds = new Set(
      sources
        .filter((source) => !isUserFacingJobSource(source))
        .map((source) => source.jobId),
    );
    const canonical = jobs.filter(
      (job) =>
        !job.canonicalJobId &&
        !fixtureJobIds.has(job._id) &&
        !isDevelopmentFixtureJob(job),
    );
    const sourceById = new Map(sources.map((source) => [source._id, source]));
    const bucket = () => ({ catalog: 0, active: 0 });
    const buckets = {
      veryFresh: bucket(),
      fresh: bucket(),
      acceptable: bucket(),
      old: bucket(),
      stale: bucket(),
      unknown: bucket(),
    };
    const activeJobs = [];
    for (const job of canonical) {
      const freshness = classifyFreshness(job.postedAt, args.now);
      const key =
        freshness.bucket === "very_fresh"
          ? "veryFresh"
          : freshness.bucket === "fresh"
            ? "fresh"
            : freshness.bucket === "acceptable"
              ? "acceptable"
              : freshness.bucket === "old"
                ? "old"
                : freshness.bucket === "stale_for_suggestions"
                  ? "stale"
                  : "unknown";
      const active = isActiveFeedLifecycle(job.lifecycleStatus);
      buckets[key].catalog += 1;
      if (active) buckets[key].active += 1;
      if (!active) continue;
      const source = job.bestSourceId ? sourceById.get(job.bestSourceId) : null;
      activeJobs.push({
        jobId: job._id,
        title: job.title,
        companyName: job.companyName,
        postedAt: job.postedAt,
        datePostedProvenance: job.datePostedProvenance ?? null,
        ageDays: freshness.ageDays,
        freshnessBucket: freshness.bucket,
        firstSeenAt: job.firstDiscoveredAt,
        lastSeenAt: source?.lastSeenAt ?? job.lastDiscoveredAt,
        lastVerifiedAt: source?.lastVerifiedAt ?? null,
        activityState: job.lifecycleStatus ?? "unknown",
      });
    }
    activeJobs.sort(
      (left, right) => (right.ageDays ?? -1) - (left.ageDays ?? -1),
    );
    return { totalCanonical: canonical.length, buckets, activeJobs };
  },
});

const catalogActivitySummaryValidator = v.object({
  truncated: v.boolean(),
  totalCanonical: v.number(),
  feedEligible: v.number(),
  hasLastVerifiedAt: v.number(),
  neverVerified: v.number(),
  staleVerification: v.number(),
  lifecycle: v.object({
    active: v.number(),
    probablyActive: v.number(),
    unknown: v.number(),
    closed: v.number(),
    expired: v.number(),
    other: v.number(),
  }),
  sources: v.object({
    total: v.number(),
    queued: v.number(),
    processedSince: v.number(),
    activeSince: v.number(),
    closedSince: v.number(),
    temporaryFailuresSince: v.number(),
  }),
  alternativeSourcePreserved: v.number(),
  remainingFeedRelevant: v.number(),
});

/** Bounded, internal-only visibility for development backfills. */
export const getCatalogActivitySummary = internalQuery({
  args: { now: v.number(), since: v.number() },
  returns: catalogActivitySummaryValidator,
  handler: async (ctx, args) => {
    const [jobs, sources] = await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
        .take(1_001),
      ctx.db.query("jobSources").withIndex("by_nextVerificationAt").take(2_001),
    ]);
    const truncated = jobs.length > 1_000 || sources.length > 2_000;
    const boundedJobs = jobs.slice(0, 1_000);
    const boundedSources = sources.slice(0, 2_000);
    const fixtureJobIds = new Set(
      boundedSources
        .filter((source) => !isUserFacingJobSource(source))
        .map((source) => source.jobId),
    );
    const realSources = boundedSources.filter(isUserFacingJobSource);
    const canonical = boundedJobs.filter(
      (job) =>
        !job.canonicalJobId &&
        !isDevelopmentFixtureJob(job) &&
        !fixtureJobIds.has(job._id),
    );
    const activeCutoff = args.now - JOB_ACTIVITY_POLICY.activeVerificationTtlMs;
    const visibleCutoff = args.now - JOB_ACTIVITY_POLICY.probablyActiveGraceMs;
    const recentCutoff = args.now - JOB_ACTIVITY_POLICY.staleAfterMs;
    const sourceByJob = new Map<Id<"jobs">, typeof boundedSources>();
    const sourceById = new Map(
      realSources.map((source) => [source._id, source]),
    );
    for (const source of realSources) {
      const existing = sourceByJob.get(source.jobId) ?? [];
      existing.push(source);
      sourceByJob.set(source.jobId, existing);
    }
    const feedEligible = canonical.filter((job) => {
      const bestSource = job.bestSourceId
        ? sourceById.get(job.bestSourceId)
        : undefined;
      return (
        isActiveFeedLifecycle(job.lifecycleStatus) &&
        bestSource !== undefined &&
        isFreshActiveSource(bestSource, args.now) &&
        (job.lastVerifiedAt ?? 0) >= visibleCutoff
      );
    });
    const alternativeSourcePreserved = canonical.filter((job) => {
      const jobSources = sourceByJob.get(job._id) ?? [];
      return (
        jobSources.some((source) => isFreshActiveSource(source, args.now)) &&
        jobSources.some((source) => source.activityStatus === "inactive")
      );
    }).length;
    const remainingFeedRelevant = canonical.filter((job) => {
      if (
        job.lifecycleStatus === "closed" ||
        job.lifecycleStatus === "expired"
      ) {
        return false;
      }
      const jobSources = sourceByJob.get(job._id) ?? [];
      return (
        jobSources.length > 0 &&
        job.lastDiscoveredAt >= recentCutoff &&
        !jobSources.some((source) => isFreshActiveSource(source, args.now))
      );
    }).length;
    return {
      truncated,
      totalCanonical: canonical.length,
      feedEligible: feedEligible.length,
      hasLastVerifiedAt: canonical.filter(
        (job) => job.lastVerifiedAt !== undefined,
      ).length,
      neverVerified: canonical.filter((job) => job.lastVerifiedAt === undefined)
        .length,
      staleVerification: canonical.filter(
        (job) =>
          job.lastVerifiedAt !== undefined && job.lastVerifiedAt < activeCutoff,
      ).length,
      lifecycle: {
        active: canonical.filter(
          (job) => job.lifecycleStatus === "verified_active",
        ).length,
        probablyActive: canonical.filter(
          (job) => job.lifecycleStatus === "probably_active",
        ).length,
        unknown: canonical.filter((job) => job.lifecycleStatus === "unknown")
          .length,
        closed: canonical.filter((job) => job.lifecycleStatus === "closed")
          .length,
        expired: canonical.filter((job) => job.lifecycleStatus === "expired")
          .length,
        other: canonical.filter(
          (job) =>
            ![
              "verified_active",
              "probably_active",
              "unknown",
              "closed",
              "expired",
            ].includes(job.lifecycleStatus ?? ""),
        ).length,
      },
      sources: {
        total: realSources.length,
        queued: realSources.filter(
          (source) =>
            (source.verificationLeaseUntil ?? 0) > args.now ||
            (source.nextVerificationAt ?? Number.POSITIVE_INFINITY) <= args.now,
        ).length,
        processedSince: realSources.filter(
          (source) => (source.lastVerificationAttemptAt ?? 0) >= args.since,
        ).length,
        activeSince: realSources.filter(
          (source) =>
            (source.lastVerificationAttemptAt ?? 0) >= args.since &&
            source.activityStatus === "verified_active",
        ).length,
        closedSince: realSources.filter(
          (source) =>
            (source.lastVerificationAttemptAt ?? 0) >= args.since &&
            source.activityStatus === "inactive",
        ).length,
        temporaryFailuresSince: realSources.filter(
          (source) =>
            (source.lastVerificationAttemptAt ?? 0) >= args.since &&
            source.activityStatus === "verification_failed",
        ).length,
      },
      alternativeSourcePreserved,
      remainingFeedRelevant,
    };
  },
});

export const getDiagnostics = query({
  args: { jobId: v.id("jobs"), now: v.number() },
  returns: v.object({
    canonicalJobId: v.id("jobs"),
    eligible: v.boolean(),
    eligibilityReason: v.string(),
    eligibilityEvidenceAt: v.union(v.number(), v.null()),
    postedAt: v.union(v.string(), v.null()),
    firstSeenAt: v.number(),
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
        verificationEvidence: v.union(v.string(), v.null()),
        activeEvidenceType: v.union(v.string(), v.null()),
        httpStatus: v.union(v.number(), v.null()),
        finalUrl: v.union(v.string(), v.null()),
        redirected: v.union(v.boolean(), v.null()),
        pageTitle: v.union(v.string(), v.null()),
        identityMatched: v.union(v.boolean(), v.null()),
        applicationAvailable: v.union(v.boolean(), v.null()),
        structuredDatePosted: v.union(v.string(), v.null()),
        structuredValidThrough: v.union(v.string(), v.null()),
        structuredJobIdentifier: v.union(v.string(), v.null()),
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
    const bestSource = job.bestSourceId
      ? sources.find((source) => source._id === job.bestSourceId)
      : undefined;
    const eligible =
      isActiveFeedLifecycle(job.lifecycleStatus) &&
      bestSource !== undefined &&
      isUserFacingJobSource(bestSource) &&
      isFreshActiveSource(bestSource, args.now);
    return {
      canonicalJobId,
      eligible,
      eligibilityReason: job.activityReason ?? "activity_reason_missing",
      eligibilityEvidenceAt:
        bestSource?.lastVerifiedAt ?? bestSource?.lastSeenAt ?? null,
      postedAt: job.postedAt,
      firstSeenAt: job.firstDiscoveredAt,
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
        verificationEvidence: source.verificationEvidence ?? null,
        activeEvidenceType: source.activeEvidenceType ?? null,
        httpStatus: source.lastVerificationHttpStatus ?? null,
        finalUrl: source.finalUrl ?? null,
        redirected: source.redirected ?? null,
        pageTitle: source.pageTitle ?? null,
        identityMatched: source.identityMatched ?? null,
        applicationAvailable: source.applicationAvailable ?? null,
        structuredDatePosted: source.structuredDatePosted ?? null,
        structuredValidThrough: source.structuredValidThrough ?? null,
        structuredJobIdentifier: source.structuredJobIdentifier ?? null,
      })),
    };
  },
});

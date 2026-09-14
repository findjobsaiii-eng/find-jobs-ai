import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import {
  sourcePriority,
  sourceYieldGroup,
  type SourceYieldGroup,
} from "./jobSourceQuality";
import {
  isDevelopmentFixtureJob,
  isUserFacingJobSource,
} from "./jobSourceProvenance";

const SOURCE_GROUPS: SourceYieldGroup[] = [
  "Employer careers",
  "ATS",
  "Drushim",
  "JobMaster",
  "AllJobs",
  "Jobify",
  "LinkedIn",
  "Indeed",
  "Recruiting agencies",
  "Aggregators",
  "Other secondary sources",
];

const yieldClassification = v.union(
  v.literal("High value"),
  v.literal("Useful secondary"),
  v.literal("Low yield"),
  v.literal("Poor/unstable for verification"),
);

const metricValidator = v.object({
  name: v.string(),
  classification: yieldClassification,
  totalCanonicalJobs: v.number(),
  uniqueSources: v.number(),
  candidateObservations: v.number(),
  newCanonicalJobs: v.number(),
  verifiedActiveNewCanonicalJobs: v.number(),
  duplicates: v.number(),
  verifiedActive: v.number(),
  probablyActive: v.number(),
  unknown: v.number(),
  closed: v.number(),
  expired: v.number(),
  insideAtLeastOneUserLocation: v.number(),
  passedProfessionalEligibility: v.number(),
  aboveRelevanceThreshold: v.number(),
  becameNewSuggestions: v.number(),
  directApplicationUrl: v.number(),
  ageSampleSize: v.number(),
  averageAgeDays: v.union(v.number(), v.null()),
  medianAgeDays: v.union(v.number(), v.null()),
  verifiedActiveNewYieldPct: v.number(),
  directSourceRatioPct: v.number(),
  duplicateRatioPct: v.number(),
  unknownRatioPct: v.number(),
  closedOrExpiredRatioPct: v.number(),
  directApplicationRatioPct: v.number(),
});

const recentRunValidator = v.object({
  runId: v.id("jobSearchRuns"),
  startedAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
  role: v.string(),
  sourceFamilies: v.array(v.string()),
  candidatesReturned: v.number(),
  persistedCandidates: v.number(),
  newCanonical: v.number(),
  duplicates: v.number(),
  verifiedActive: v.number(),
  probablyActive: v.number(),
  unknown: v.number(),
  closed: v.number(),
  expired: v.number(),
  suggestionsContribution: v.number(),
});

type MetricBucket = {
  jobIds: Set<Id<"jobs">>;
  sourceUrls: Set<string>;
  directApplicationJobIds: Set<Id<"jobs">>;
  candidateObservations: number;
  duplicates: number;
  newCanonicalJobIds: Set<Id<"jobs">>;
  verifiedActiveNewJobIds: Set<Id<"jobs">>;
};

function newBucket(): MetricBucket {
  return {
    jobIds: new Set(),
    sourceUrls: new Set(),
    directApplicationJobIds: new Set(),
    candidateObservations: 0,
    duplicates: 0,
    newCanonicalJobIds: new Set(),
    verifiedActiveNewJobIds: new Set(),
  };
}

function asPct(numerator: number, denominator: number) {
  return denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 1_000) / 10;
}

function finitePostedAgeDays(postedAt: string | null, now: number) {
  if (!postedAt) return null;
  const timestamp = Date.parse(postedAt);
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + 2 * 24 * 60 * 60 * 1_000
  ) {
    return null;
  }
  return Math.max(0, (now - timestamp) / (24 * 60 * 60 * 1_000));
}

function classifyYield(args: {
  candidateObservations: number;
  verifiedActiveNewYieldPct: number;
  verifiedActive: number;
  becameNewSuggestions: number;
  unknownRatioPct: number;
  closedOrExpiredRatioPct: number;
  directSourceRatioPct: number;
}) {
  if (
    args.verifiedActiveNewYieldPct >= 20 &&
    args.verifiedActive >= 2 &&
    (args.directSourceRatioPct >= 25 || args.becameNewSuggestions > 0)
  ) {
    return "High value" as const;
  }
  if (
    args.verifiedActive >= 2 ||
    args.becameNewSuggestions > 0 ||
    args.verifiedActiveNewYieldPct >= 8
  ) {
    return "Useful secondary" as const;
  }
  if (
    args.candidateObservations >= 2 &&
    args.verifiedActiveNewYieldPct < 10 &&
    args.unknownRatioPct + args.closedOrExpiredRatioPct >= 70
  ) {
    return "Poor/unstable for verification" as const;
  }
  return "Low yield" as const;
}

function professionallyEligible(match: Doc<"jobMatches">) {
  return match.exclusionReasons.every(
    (reason) => reason === "location_conflict",
  );
}

function roleFromCriteria(criteria: string) {
  try {
    const parsed = JSON.parse(criteria) as unknown;
    if (parsed && typeof parsed === "object") {
      const value = parsed as Record<string, unknown>;
      if (typeof value.role === "string") return value.role;
      if (typeof value.targetRole === "string") return value.targetRole;
      if (Array.isArray(value.targetRoles)) {
        const roles = value.targetRoles.filter(
          (role): role is string => typeof role === "string",
        );
        if (roles.length > 0) return roles.join(", ");
      }
    }
  } catch {
    // Older rows may contain a human-readable criteria string.
  }
  return criteria.slice(0, 160);
}

export const getSourceYieldAuditForDevelopment = internalQuery({
  args: {},
  returns: v.object({
    generatedAt: v.number(),
    dataLimits: v.object({
      jobs: v.number(),
      sources: v.number(),
      ingestionEvents: v.number(),
      matches: v.number(),
      recentRuns: v.number(),
      truncated: v.boolean(),
    }),
    definitions: v.object({
      candidateObservation: v.string(),
      newCanonicalAttribution: v.string(),
      verifiedActiveYield: v.string(),
      matchingMetrics: v.string(),
      recentRunSourceFamilies: v.string(),
    }),
    families: v.array(metricValidator),
    topDomains: v.array(metricValidator),
    recentRuns: v.array(recentRunValidator),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const [jobs, sources, events, matches, runs] = await Promise.all([
      ctx.db
        .query("jobs")
        .withIndex("by_lifecycleStatus_and_lastVerifiedAt")
        .take(1_001),
      ctx.db.query("jobSources").withIndex("by_nextVerificationAt").take(2_001),
      ctx.db
        .query("jobIngestionEvents")
        .withIndex("by_observedAt")
        .order("desc")
        .take(5_001),
      ctx.db
        .query("jobMatches")
        .withIndex("by_evaluatedAt")
        .order("desc")
        .take(5_001),
      ctx.db
        .query("jobSearchRuns")
        .withIndex("by_startedAt")
        .order("desc")
        .take(16),
    ]);

    const boundedJobs = jobs.slice(0, 1_000);
    const boundedSources = sources.slice(0, 2_000);
    const boundedEvents = events.slice(0, 5_000);
    const boundedMatches = matches.slice(0, 5_000);
    const recentRuns = runs.slice(0, 15);
    const canonicalJobs = boundedJobs.filter(
      (job) => !job.canonicalJobId && !isDevelopmentFixtureJob(job),
    );
    const jobsById = new Map(canonicalJobs.map((job) => [job._id, job]));
    const realSources = boundedSources.filter(
      (source) => jobsById.has(source.jobId) && isUserFacingJobSource(source),
    );
    const sourcesById = new Map(
      realSources.map((source) => [source._id, source]),
    );
    const sourcesByJob = new Map<Id<"jobs">, Doc<"jobSources">[]>();
    for (const source of realSources) {
      const list = sourcesByJob.get(source.jobId) ?? [];
      list.push(source);
      sourcesByJob.set(source.jobId, list);
    }
    const matchesByJob = new Map<Id<"jobs">, Doc<"jobMatches">[]>();
    for (const match of boundedMatches) {
      if (!jobsById.has(match.jobId)) continue;
      const list = matchesByJob.get(match.jobId) ?? [];
      list.push(match);
      matchesByJob.set(match.jobId, list);
    }

    const familyBuckets = new Map<SourceYieldGroup, MetricBucket>(
      SOURCE_GROUPS.map((group) => [group, newBucket()]),
    );
    const domainBuckets = new Map<string, MetricBucket>();
    const bucketsForSource = (source: Doc<"jobSources">) => {
      const family = sourceYieldGroup(source.domain, source.sourceTier);
      const domain = source.domain
        .toLocaleLowerCase("en-US")
        .replace(/^www\./u, "");
      const familyBucket = familyBuckets.get(family)!;
      const domainBucket = domainBuckets.get(domain) ?? newBucket();
      domainBuckets.set(domain, domainBucket);
      return [familyBucket, domainBucket];
    };

    for (const source of realSources) {
      for (const bucket of bucketsForSource(source)) {
        bucket.jobIds.add(source.jobId);
        bucket.sourceUrls.add(source.normalizedUrl);
        if (source.applicationUrl)
          bucket.directApplicationJobIds.add(source.jobId);
      }
    }
    for (const event of boundedEvents) {
      const source = sourcesById.get(event.sourceId);
      if (!source) continue;
      for (const bucket of bucketsForSource(source)) {
        bucket.candidateObservations += 1;
        if (event.mergeReason) bucket.duplicates += 1;
      }
    }

    for (const job of canonicalJobs) {
      const jobSources = sourcesByJob.get(job._id) ?? [];
      const origin = [...jobSources].sort(
        (left, right) =>
          left.firstSeenAt - right.firstSeenAt ||
          sourcePriority(left.sourceTier) - sourcePriority(right.sourceTier),
      )[0];
      if (!origin) continue;
      for (const bucket of bucketsForSource(origin)) {
        bucket.newCanonicalJobIds.add(job._id);
        if (job.lifecycleStatus === "verified_active") {
          bucket.verifiedActiveNewJobIds.add(job._id);
        }
      }
    }

    const directSourceJobIds = new Set(
      realSources
        .filter(
          (source) =>
            source.sourceTier === "employer" || source.sourceTier === "ats",
        )
        .map((source) => source.jobId),
    );

    const finishMetric = (name: string, bucket: MetricBucket) => {
      const bucketJobs = [...bucket.jobIds]
        .map((jobId) => jobsById.get(jobId))
        .filter((job): job is Doc<"jobs"> => Boolean(job));
      const lifecycleCount = (status: Doc<"jobs">["lifecycleStatus"]) =>
        bucketJobs.filter((job) => job.lifecycleStatus === status).length;
      const ages = bucketJobs
        .map((job) => finitePostedAgeDays(job.postedAt, now))
        .filter((age): age is number => age !== null)
        .sort((left, right) => left - right);
      const matchesForJob = (jobId: Id<"jobs">) =>
        matchesByJob.get(jobId) ?? [];
      const insideAtLeastOneUserLocation = bucketJobs.filter((job) =>
        matchesForJob(job._id).some(
          (match) => !match.exclusionReasons.includes("location_conflict"),
        ),
      ).length;
      const passedProfessionalEligibility = bucketJobs.filter((job) =>
        matchesForJob(job._id).some(professionallyEligible),
      ).length;
      const aboveRelevanceThreshold = bucketJobs.filter((job) =>
        matchesForJob(job._id).some((match) => match.outcome === "eligible"),
      ).length;
      const becameNewSuggestions = bucketJobs.filter((job) =>
        matchesForJob(job._id).some((match) => match.displayEligible === true),
      ).length;
      const verifiedActive = lifecycleCount("verified_active");
      const probablyActive = lifecycleCount("probably_active");
      const unknown = lifecycleCount("unknown");
      const closed = lifecycleCount("closed");
      const expired = lifecycleCount("expired");
      const directSourceRatioPct = asPct(
        bucketJobs.filter((job) => directSourceJobIds.has(job._id)).length,
        bucketJobs.length,
      );
      const verifiedActiveNewYieldPct = asPct(
        bucket.verifiedActiveNewJobIds.size,
        bucket.candidateObservations,
      );
      const closedOrExpiredRatioPct = asPct(
        closed + expired,
        bucketJobs.length,
      );
      const unknownRatioPct = asPct(unknown, bucketJobs.length);
      const result = {
        name,
        totalCanonicalJobs: bucketJobs.length,
        uniqueSources: bucket.sourceUrls.size,
        candidateObservations: bucket.candidateObservations,
        newCanonicalJobs: bucket.newCanonicalJobIds.size,
        verifiedActiveNewCanonicalJobs: bucket.verifiedActiveNewJobIds.size,
        duplicates: bucket.duplicates,
        verifiedActive,
        probablyActive,
        unknown,
        closed,
        expired,
        insideAtLeastOneUserLocation,
        passedProfessionalEligibility,
        aboveRelevanceThreshold,
        becameNewSuggestions,
        directApplicationUrl: bucket.directApplicationJobIds.size,
        ageSampleSize: ages.length,
        averageAgeDays:
          ages.length === 0
            ? null
            : Math.round(
                (ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10,
              ) / 10,
        medianAgeDays:
          ages.length === 0
            ? null
            : Math.round(
                (ages.length % 2 === 1
                  ? ages[Math.floor(ages.length / 2)]
                  : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2) *
                  10,
              ) / 10,
        verifiedActiveNewYieldPct,
        directSourceRatioPct,
        duplicateRatioPct: asPct(
          bucket.duplicates,
          bucket.candidateObservations,
        ),
        unknownRatioPct,
        closedOrExpiredRatioPct,
        directApplicationRatioPct: asPct(
          bucket.directApplicationJobIds.size,
          bucketJobs.length,
        ),
      };
      return {
        ...result,
        classification: classifyYield({
          candidateObservations: result.candidateObservations,
          verifiedActiveNewYieldPct: result.verifiedActiveNewYieldPct,
          verifiedActive: result.verifiedActive,
          becameNewSuggestions: result.becameNewSuggestions,
          unknownRatioPct: result.unknownRatioPct,
          closedOrExpiredRatioPct: result.closedOrExpiredRatioPct,
          directSourceRatioPct: result.directSourceRatioPct,
        }),
      };
    };

    const recentRunResults = await Promise.all(
      recentRuns.map(async (run) => {
        const [query, discoveries] = await Promise.all([
          ctx.db.get("jobSearchQueries", run.queryId),
          ctx.db
            .query("jobDiscoveries")
            .withIndex("by_searchRunId", (q) => q.eq("searchRunId", run._id))
            .take(100),
        ]);
        const runJobIds = new Set(
          discoveries
            .map((discovery) => discovery.jobId)
            .filter((jobId) => jobsById.has(jobId)),
        );
        const runJobs = [...runJobIds]
          .map((jobId) => jobsById.get(jobId))
          .filter((job): job is Doc<"jobs"> => Boolean(job));
        const sourceFamilies = new Set<string>();
        for (const job of runJobs) {
          for (const source of sourcesByJob.get(job._id) ?? []) {
            sourceFamilies.add(
              sourceYieldGroup(source.domain, source.sourceTier),
            );
          }
        }
        const lifecycleCount = (status: Doc<"jobs">["lifecycleStatus"]) =>
          runJobs.filter((job) => job.lifecycleStatus === status).length;
        return {
          runId: run._id,
          startedAt: run.startedAt,
          completedAt: run.completedAt ?? null,
          role: query
            ? roleFromCriteria(query.normalizedCriteria)
            : "Unknown role",
          sourceFamilies: [...sourceFamilies].sort(),
          candidatesReturned: run.returnedCandidateCount,
          persistedCandidates: runJobs.length,
          newCanonical: run.insertedCount,
          duplicates: run.deduplicatedCount,
          verifiedActive: lifecycleCount("verified_active"),
          probablyActive: lifecycleCount("probably_active"),
          unknown: lifecycleCount("unknown"),
          closed: lifecycleCount("closed"),
          expired: lifecycleCount("expired"),
          suggestionsContribution: runJobs.filter((job) =>
            (matchesByJob.get(job._id) ?? []).some(
              (match) => match.displayEligible === true,
            ),
          ).length,
        };
      }),
    );

    return {
      generatedAt: now,
      dataLimits: {
        jobs: canonicalJobs.length,
        sources: realSources.length,
        ingestionEvents: boundedEvents.length,
        matches: boundedMatches.length,
        recentRuns: recentRuns.length,
        truncated:
          jobs.length > 1_000 ||
          sources.length > 2_000 ||
          events.length > 5_000 ||
          matches.length > 5_000 ||
          runs.length > 15,
      },
      definitions: {
        candidateObservation:
          "A persisted provider/source ingestion event; rejected raw provider candidates were not historically retained by source.",
        newCanonicalAttribution:
          "Each canonical job is attributed to its earliest stored real source, with source tier used only as a tie-breaker.",
        verifiedActiveYield:
          "Currently verified-active new canonical jobs attributed to the source divided by persisted candidate observations.",
        matchingMetrics:
          "Distinct jobs that passed for at least one stored user match; professional eligibility excludes only location and threshold from the hard gates, while Suggestions means current displayEligible=true.",
        recentRunSourceFamilies:
          "Families are derived from sources attached to persisted discoveries; candidates rejected before persistence cannot be assigned historically.",
      },
      families: SOURCE_GROUPS.map((group) =>
        finishMetric(group, familyBuckets.get(group)!),
      ),
      topDomains: [...domainBuckets.entries()]
        .map(([domain, bucket]) => finishMetric(domain, bucket))
        .sort(
          (left, right) =>
            right.candidateObservations - left.candidateObservations ||
            right.totalCanonicalJobs - left.totalCanonicalJobs,
        )
        .slice(0, 15),
      recentRuns: recentRunResults,
    };
  },
});

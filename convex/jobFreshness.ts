export const JOB_FRESHNESS_POLICY = {
  veryFreshMaxDays: 14,
  freshMaxDays: 30,
  acceptableMaxDays: 60,
  oldMaxDays: 90,
  strongOldMatchScore: 78,
} as const;

export type DatePostedProvenance =
  | "employer_ats_structured"
  | "jobposting_jsonld"
  | "provider_structured"
  | "page_explicit"
  | "discovery_metadata";

export type FreshnessBucket =
  | "very_fresh"
  | "fresh"
  | "acceptable"
  | "old"
  | "stale_for_suggestions"
  | "freshness_unknown";

const DAY_MS = 24 * 60 * 60 * 1_000;

export function postingTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function normalizeDiscoveredPostingDate(
  value: string | null | undefined,
  observedAt: number,
) {
  if (!value) return null;
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  const match = normalized.match(
    /(?:posted\s+)?(\d{1,3})\s+(minute|hour|day|week|month|year)s?\s+ago/u,
  );
  if (!match) {
    const absolute = postingTimestamp(value);
    return absolute === null ? null : new Date(absolute).toISOString();
  }
  const amount = Number(match[1]);
  const unitDays =
    match[2] === "minute"
      ? 1 / 1440
      : match[2] === "hour"
        ? 1 / 24
        : match[2] === "day"
          ? 1
          : match[2] === "week"
            ? 7
            : match[2] === "month"
              ? 30
              : 365;
  return new Date(observedAt - amount * unitDays * DAY_MS).toISOString();
}

export function selectOriginalPostingDate(
  existing: {
    postedAt?: string | null;
    datePostedProvenance?: DatePostedProvenance;
  },
  candidate: {
    postedAt?: string | null;
    datePostedProvenance?: DatePostedProvenance;
  },
) {
  const existingTimestamp = postingTimestamp(existing.postedAt);
  const candidateTimestamp = postingTimestamp(candidate.postedAt);
  if (candidateTimestamp === null) return existing;
  if (existingTimestamp === null) return candidate;
  const priority: Record<DatePostedProvenance, number> = {
    employer_ats_structured: 1,
    jobposting_jsonld: 2,
    provider_structured: 3,
    page_explicit: 4,
    discovery_metadata: 5,
  };
  const existingPriority = existing.datePostedProvenance
    ? priority[existing.datePostedProvenance]
    : 99;
  const candidatePriority = candidate.datePostedProvenance
    ? priority[candidate.datePostedProvenance]
    : 99;
  if (candidatePriority < existingPriority) return candidate;
  if (candidatePriority > existingPriority) return existing;
  // Evidence of the same quality keeps the older original publication date.
  if (candidateTimestamp < existingTimestamp) return candidate;
  if (candidateTimestamp > existingTimestamp) return existing;
  return candidate.datePostedProvenance ? candidate : existing;
}

export function classifyFreshness(
  postedAt: string | null | undefined,
  now = Date.now(),
): { bucket: FreshnessBucket; ageDays: number | null } {
  const timestamp = postingTimestamp(postedAt);
  if (timestamp === null || timestamp > now + DAY_MS) {
    return { bucket: "freshness_unknown", ageDays: null };
  }
  const ageDays = Math.max(0, Math.floor((now - timestamp) / DAY_MS));
  if (ageDays <= JOB_FRESHNESS_POLICY.veryFreshMaxDays)
    return { bucket: "very_fresh", ageDays };
  if (ageDays <= JOB_FRESHNESS_POLICY.freshMaxDays)
    return { bucket: "fresh", ageDays };
  if (ageDays <= JOB_FRESHNESS_POLICY.acceptableMaxDays)
    return { bucket: "acceptable", ageDays };
  if (ageDays <= JOB_FRESHNESS_POLICY.oldMaxDays)
    return { bucket: "old", ageDays };
  return { bucket: "stale_for_suggestions", ageDays };
}

export function evaluateSuggestionFreshness(args: {
  postedAt: string | null | undefined;
  lifecycleStatus: string | undefined;
  relevanceScore: number;
  now?: number;
}) {
  const freshness = classifyFreshness(args.postedAt, args.now);
  if (freshness.bucket === "stale_for_suggestions") {
    return { ...freshness, eligible: false, reason: "stale_posting" };
  }
  if (
    freshness.bucket === "old" &&
    (args.lifecycleStatus !== "verified_active" ||
      args.relevanceScore < JOB_FRESHNESS_POLICY.strongOldMatchScore)
  ) {
    return {
      ...freshness,
      eligible: false,
      reason: "old_posting_requires_strong_match",
    };
  }
  return { ...freshness, eligible: true, reason: null };
}

export function freshnessSortValue(postedAt: string | null | undefined) {
  return postingTimestamp(postedAt) ?? Number.NEGATIVE_INFINITY;
}

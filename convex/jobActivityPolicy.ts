export const JOB_ACTIVITY_POLICY = {
  activeVerificationTtlMs: 3 * 24 * 60 * 60 * 1_000,
  probablyActiveGraceMs: 14 * 24 * 60 * 60 * 1_000,
  staleAfterMs: 45 * 24 * 60 * 60 * 1_000,
  verificationLeaseMs: 10 * 60 * 1_000,
  maxRetryBackoffMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

export type JobLifecycle =
  "verified_active" | "probably_active" | "closed" | "expired" | "unknown";

type SourceState = {
  activityStatus:
    | "pending_verification"
    | "verified_active"
    | "inactive"
    | "verification_failed";
  lastSeenAt: number;
  lastVerifiedAt?: number;
  verificationMethod?: string;
  verificationEvidence?: string;
};

export function retryDelayMs(failureCount: number) {
  const exponent = Math.max(0, Math.min(failureCount - 1, 6));
  return Math.min(
    6 * 60 * 60 * 1_000 * 2 ** exponent,
    JOB_ACTIVITY_POLICY.maxRetryBackoffMs,
  );
}

function parsedDeadline(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function deriveJobLifecycle(args: {
  sources: SourceState[];
  lastSeenAt: number;
  applicationDeadline?: string | null;
  now: number;
}): { status: JobLifecycle; reason: string; closedAt?: number } {
  const deadline = parsedDeadline(args.applicationDeadline);
  if (deadline !== null && deadline < args.now) {
    return {
      status: "expired",
      reason: "application_deadline_passed",
      closedAt: deadline,
    };
  }
  const active = args.sources.filter(
    (source) => source.activityStatus === "verified_active",
  );
  if (
    active.some(
      (source) =>
        source.lastVerifiedAt !== undefined &&
        source.lastVerifiedAt >=
          args.now - JOB_ACTIVITY_POLICY.activeVerificationTtlMs,
    )
  ) {
    return { status: "verified_active", reason: "recent_active_source" };
  }
  if (
    active.some(
      (source) =>
        (source.lastVerifiedAt ?? 0) >=
        args.now - JOB_ACTIVITY_POLICY.probablyActiveGraceMs,
    )
  ) {
    return {
      status: "probably_active",
      reason: "active_source_awaiting_recheck",
    };
  }
  if (
    args.sources.length > 0 &&
    args.sources.every((source) => source.activityStatus === "inactive")
  ) {
    return {
      status: "closed",
      reason:
        args.sources.find((source) => source.verificationEvidence)
          ?.verificationEvidence ?? "all_sources_confirmed_inactive",
      closedAt: args.now,
    };
  }
  if (
    Math.max(
      args.lastSeenAt,
      ...active.map((source) => source.lastVerifiedAt ?? 0),
    ) <
    args.now - JOB_ACTIVITY_POLICY.staleAfterMs
  ) {
    return {
      status: "expired",
      reason: "not_seen_or_verified_within_stale_window",
      closedAt: args.now,
    };
  }
  return { status: "unknown", reason: "no_recent_conclusive_verification" };
}

export function isActiveFeedLifecycle(status: string | undefined) {
  return status === "verified_active" || status === "probably_active";
}

export function activityReasonForLifecycle(args: {
  lifecycle: ReturnType<typeof deriveJobLifecycle>;
  sources: SourceState[];
  bestSource?: SourceState;
}) {
  if (args.lifecycle.status === "verified_active") {
    if (args.bestSource?.verificationMethod === "development_fixture") {
      return "development_fixture_active";
    }
    if (args.sources.some((source) => source.activityStatus === "inactive")) {
      return "alternative_source_active";
    }
    if (
      args.bestSource?.verificationEvidence ===
      "Structured JobPosting valid; HTTP 2xx"
    ) {
      return "structured_jobposting_valid";
    }
    return "http_verified";
  }
  if (args.lifecycle.status === "probably_active") {
    return "http_verified_within_grace";
  }
  if (
    args.lifecycle.status === "unknown" &&
    args.sources.some(
      (source) =>
        source.activityStatus === "pending_verification" ||
        source.activityStatus === "verification_failed",
    )
  ) {
    return "provider_recently_seen_unverified";
  }
  if (args.lifecycle.status === "unknown" && args.sources.length === 0) {
    return "unverifiable_source";
  }
  return args.lifecycle.reason;
}

// Discovery currently uses web-search suggestions, not a trusted provider status API.
// Repeated sightings alone must never extend a successful verification indefinitely.
export function isFreshActiveSource(source: SourceState, now = Date.now()) {
  return (
    source.activityStatus === "verified_active" &&
    source.lastVerifiedAt !== undefined &&
    source.lastVerifiedAt >= now - JOB_ACTIVITY_POLICY.probablyActiveGraceMs
  );
}

export function hasFreshJobActivity(
  job: {
    lastVerifiedAt?: number;
    applicationDeadline?: string | null;
  },
  now = Date.now(),
) {
  const deadline = parsedDeadline(job.applicationDeadline);
  return (
    (deadline === null || deadline >= now) &&
    job.lastVerifiedAt !== undefined &&
    job.lastVerifiedAt >= now - JOB_ACTIVITY_POLICY.probablyActiveGraceMs
  );
}

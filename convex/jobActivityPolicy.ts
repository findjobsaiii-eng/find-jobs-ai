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
        source.lastSeenAt >=
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
  if (args.lastSeenAt < args.now - JOB_ACTIVITY_POLICY.staleAfterMs) {
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

export const JOB_ACTIVITY_POLICY = {
  aiEvidenceTtlMs: 3 * 24 * 60 * 60 * 1_000,
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
    | "unknown"
    | "inactive"
    | "verification_failed";
  lastSeenAt: number;
  lastVerifiedAt?: number;
  verificationMethod?: string;
  verificationEvidence?: string;
  activeEvidenceType?: string;
  closureReason?: string;
  normalizedUrl?: string;
  aiAssessedAt?: number;
  aiPostedAt?: string;
  aiAssessment?: {
    status: "open" | "closed" | "unknown";
    evidenceType: "application_available" | "recent_posting" | "none";
    evidenceUrl: string | null;
    evidenceText: string | null;
  };
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
    (source) =>
      source.activityStatus === "verified_active" &&
      Boolean(source.activeEvidenceType),
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
  if (args.sources.some((source) => hasFreshAiOpenEvidence(source, args.now))) {
    return { status: "probably_active", reason: "ai_open_server_unknown" };
  }
  if (
    args.sources.length > 0 &&
    args.sources.every((source) => source.activityStatus === "inactive")
  ) {
    const structuredExpiry = args.sources.find(
      (source) =>
        source.verificationEvidence === "structured_valid_through_expired",
    );
    return {
      status: structuredExpiry ? "expired" : "closed",
      reason:
        structuredExpiry?.verificationEvidence ??
        args.sources.find((source) => source.closureReason)?.closureReason ??
        args.sources.find((source) => source.verificationEvidence)
          ?.verificationEvidence ??
        "all_sources_confirmed_inactive",
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
    return args.bestSource?.activeEvidenceType ?? "active_evidence_missing";
  }
  if (args.lifecycle.status === "probably_active") {
    return args.lifecycle.reason === "ai_open_server_unknown"
      ? "ai_open_server_unknown"
      : "http_verified_within_grace";
  }
  if (
    args.lifecycle.status === "unknown" &&
    args.sources.some(
      (source) =>
        source.activityStatus === "pending_verification" ||
        source.activityStatus === "unknown" ||
        source.activityStatus === "verification_failed",
    )
  ) {
    return (
      args.sources.find(
        (source) =>
          (source.activityStatus === "unknown" ||
            source.activityStatus === "verification_failed") &&
          source.verificationEvidence,
      )?.verificationEvidence ?? "provider_recently_seen_unverified"
    );
  }
  if (args.lifecycle.status === "unknown" && args.sources.length === 0) {
    return "unverifiable_source";
  }
  return args.lifecycle.reason;
}

// Server evidence and AI evidence keep independent timestamps and provenance.
export function hasFreshAiOpenEvidence(source: SourceState, now = Date.now()) {
  const assessment = source.aiAssessment;
  if (
    !assessment ||
    assessment.status !== "open" ||
    !assessment.evidenceText?.trim() ||
    !source.normalizedUrl ||
    assessment.evidenceUrl !== source.normalizedUrl ||
    source.aiAssessedAt === undefined ||
    source.aiAssessedAt > now ||
    source.aiAssessedAt < now - JOB_ACTIVITY_POLICY.aiEvidenceTtlMs ||
    (source.activityStatus !== "unknown" &&
      source.activityStatus !== "verification_failed")
  )
    return false;
  // Only inconclusive access failures or a recognized listing qualify. Unsafe URLs,
  // generic pages, missing/replaced identities, and broken links remain excluded.
  const reason = source.verificationEvidence ?? "";
  const safeUnknown =
    reason === "Authentication or bot challenge" ||
    reason === "undated_listing_http_only" ||
    reason === "old_listing_http_only" ||
    /^Temporary HTTP (?:429|5\d\d)$/u.test(reason) ||
    /^HTTP (?:401|403)$/u.test(reason) ||
    /^Verification failed: (?:request_timeout|request_failed|connect |read |socket hang up|getaddrinfo |Client network socket disconnected)/u.test(
      reason,
    );
  if (!safeUnknown) return false;
  if (assessment.evidenceType === "application_available") return true;
  if (
    assessment.evidenceType !== "recent_posting" ||
    reason === "old_listing_http_only"
  )
    return false;
  const postedAt = parsedDeadline(source.aiPostedAt);
  return (
    postedAt !== null &&
    postedAt <= now &&
    postedAt >= now - 30 * 24 * 60 * 60 * 1_000
  );
}

export function isFreshActiveSource(source: SourceState, now = Date.now()) {
  return (
    source.activityStatus === "verified_active" &&
    Boolean(source.activeEvidenceType) &&
    source.lastVerifiedAt !== undefined &&
    source.lastVerifiedAt >= now - JOB_ACTIVITY_POLICY.probablyActiveGraceMs
  );
}

export function isDisplayEligibleSource(source: SourceState, now = Date.now()) {
  return (
    isFreshActiveSource(source, now) || hasFreshAiOpenEvidence(source, now)
  );
}

export function hasFreshJobActivity(
  job: {
    lastVerifiedAt?: number;
    aiActivityEvidenceAt?: number;
    activityReason?: string;
    applicationDeadline?: string | null;
  },
  now = Date.now(),
) {
  const deadline = parsedDeadline(job.applicationDeadline);
  if (deadline !== null && deadline < now) return false;
  if (job.activityReason === "ai_open_server_unknown") {
    return (
      job.aiActivityEvidenceAt !== undefined &&
      job.aiActivityEvidenceAt <= now &&
      job.aiActivityEvidenceAt >= now - JOB_ACTIVITY_POLICY.aiEvidenceTtlMs
    );
  }
  return (
    job.lastVerifiedAt !== undefined &&
    job.lastVerifiedAt >= now - JOB_ACTIVITY_POLICY.probablyActiveGraceMs
  );
}

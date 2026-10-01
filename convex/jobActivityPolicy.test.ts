import { describe, expect, it } from "vitest";
import {
  activityReasonForLifecycle,
  deriveJobLifecycle,
  hasFreshJobActivity,
  JOB_ACTIVITY_POLICY,
  retryDelayMs,
} from "./jobActivityPolicy";

const now = 100 * 24 * 60 * 60 * 1_000;

describe("job activity policy", () => {
  it("keeps a recently verified source active", () => {
    expect(
      deriveJobLifecycle({
        sources: [
          {
            activityStatus: "verified_active",
            activeEvidenceType: "active_application_flow",
            lastSeenAt: now,
            lastVerifiedAt: now,
          },
        ],
        lastSeenAt: now,
        now,
      }).status,
    ).toBe("verified_active");
  });

  it("uses a bounded probably-active grace period", () => {
    expect(
      deriveJobLifecycle({
        sources: [
          {
            activityStatus: "verified_active",
            activeEvidenceType: "active_application_flow",
            lastSeenAt: now,
            lastVerifiedAt:
              now - JOB_ACTIVITY_POLICY.activeVerificationTtlMs - 1,
          },
        ],
        lastSeenAt: now,
        now,
      }).status,
    ).toBe("probably_active");
  });

  it("expires unverified jobs after the stale window", () => {
    expect(
      deriveJobLifecycle({
        sources: [{ activityStatus: "verification_failed", lastSeenAt: 1 }],
        lastSeenAt: 1,
        now,
      }),
    ).toMatchObject({
      status: "expired",
      reason: "not_seen_or_verified_within_stale_window",
    });
  });

  it("marks all-confirmed-inactive jobs closed without deleting them", () => {
    expect(
      deriveJobLifecycle({
        sources: [
          {
            activityStatus: "inactive",
            lastSeenAt: now,
            verificationEvidence: "HTTP 410",
          },
        ],
        lastSeenAt: now,
        now,
      }),
    ).toMatchObject({ status: "closed", reason: "HTTP 410" });
  });

  it("marks an expired structured deadline as expired", () => {
    expect(
      deriveJobLifecycle({
        sources: [
          {
            activityStatus: "inactive",
            lastSeenAt: now,
            verificationEvidence: "structured_valid_through_expired",
          },
        ],
        lastSeenAt: now,
        now,
      }),
    ).toMatchObject({
      status: "expired",
      reason: "structured_valid_through_expired",
    });
  });

  it("backs temporary failures off to a bounded delay", () => {
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
    expect(retryDelayMs(99)).toBe(JOB_ACTIVITY_POLICY.maxRetryBackoffMs);
  });
});

it("does not let repeated discovery extend old verification", () => {
  expect(
    deriveJobLifecycle({
      sources: [
        {
          activityStatus: "verified_active",
          activeEvidenceType: "active_application_flow",
          lastSeenAt: now,
          lastVerifiedAt: 1,
        },
      ],
      lastSeenAt: now,
      now,
    }).status,
  ).toBe("unknown");
});
it("keeps another fresh source eligible after one closes", () => {
  expect(
    deriveJobLifecycle({
      sources: [
        { activityStatus: "inactive", lastSeenAt: now },
        {
          activityStatus: "verified_active",
          activeEvidenceType: "active_application_flow",
          lastSeenAt: 1,
          lastVerifiedAt: now,
        },
      ],
      lastSeenAt: 1,
      now,
    }).status,
  ).toBe("verified_active");
});

it("records whether active evidence came from HTTP or an alternative source", () => {
  const best = {
    activityStatus: "verified_active" as const,
    lastSeenAt: now,
    lastVerifiedAt: now,
    verificationMethod: "http_content_v1",
    activeEvidenceType: "active_application_flow",
  };
  const lifecycle = deriveJobLifecycle({
    sources: [best],
    lastSeenAt: now,
    now,
  });
  expect(
    activityReasonForLifecycle({
      lifecycle,
      sources: [best],
      bestSource: best,
    }),
  ).toBe("active_application_flow");
  expect(
    activityReasonForLifecycle({
      lifecycle,
      sources: [best, { activityStatus: "inactive", lastSeenAt: now }],
      bestSource: best,
    }),
  ).toBe("alternative_source_active");
});

const aiSource = {
  activityStatus: "unknown" as const,
  lastSeenAt: now,
  normalizedUrl: "https://example.com/jobs/123",
  verificationEvidence: "Authentication or bot challenge",
  aiAssessedAt: now,
  aiAssessment: {
    status: "open" as const,
    evidenceType: "application_available" as const,
    evidenceUrl: "https://example.com/jobs/123",
    evidenceText: "The exact job listing offers an Apply button.",
  },
};

it.each(["open", "closed", "unknown"] as const)(
  "server open overrides AI %s",
  (status) => {
    expect(
      deriveJobLifecycle({
        sources: [
          {
            ...aiSource,
            activityStatus: "verified_active",
            activeEvidenceType: "active_application_flow",
            lastVerifiedAt: now,
            aiAssessment: { ...aiSource.aiAssessment, status },
          },
        ],
        lastSeenAt: now,
        now,
      }).status,
    ).toBe("verified_active");
  },
);

it.each(["open", "closed", "unknown"] as const)(
  "server closed overrides AI %s",
  (status) => {
    expect(
      deriveJobLifecycle({
        sources: [
          {
            ...aiSource,
            activityStatus: "inactive",
            aiAssessment: { ...aiSource.aiAssessment, status },
          },
        ],
        lastSeenAt: now,
        now,
      }).status,
    ).toBe("closed");
  },
);

it.each(["open", "closed", "unknown"] as const)(
  "resolves AI %s with an inconclusive server check",
  (status) => {
    const source = {
      ...aiSource,
      aiAssessment: { ...aiSource.aiAssessment, status },
    };
    expect(
      deriveJobLifecycle({ sources: [source], lastSeenAt: now, now }).status,
    ).toBe(status === "open" ? "probably_active" : "unknown");
  },
);

it.each([
  "Generic destination page",
  "job_identity_not_confirmed",
  "job_identity_replaced",
  "Unsafe final URL",
  "HTTP 404",
  "Unsupported response type",
])("rejects AI fallback when server reports %s", (verificationEvidence) => {
  expect(
    deriveJobLifecycle({
      sources: [{ ...aiSource, verificationEvidence }],
      lastSeenAt: now,
      now,
    }).status,
  ).toBe("unknown");
});

it("expires AI evidence without extending it through repeated sightings", () => {
  expect(
    deriveJobLifecycle({
      sources: [
        {
          ...aiSource,
          aiAssessedAt: now - JOB_ACTIVITY_POLICY.aiEvidenceTtlMs - 1,
        },
      ],
      lastSeenAt: now,
      now,
    }).status,
  ).toBe("unknown");
});

it("requires exact listing evidence and a recent real date", () => {
  const source = {
    ...aiSource,
    aiAssessment: {
      ...aiSource.aiAssessment,
      evidenceType: "recent_posting" as const,
    },
  };
  const lifecycle = (extra: Partial<typeof source> & { aiPostedAt?: string }) =>
    deriveJobLifecycle({
      sources: [{ ...source, ...extra }],
      lastSeenAt: now,
      now,
    }).status;
  expect(lifecycle({})).toBe("unknown");
  expect(
    lifecycle({ aiPostedAt: new Date(now - 86400000).toISOString() }),
  ).toBe("probably_active");
  expect(
    lifecycle({ aiPostedAt: new Date(now + 86400000).toISOString() }),
  ).toBe("unknown");
  expect(
    lifecycle({ aiPostedAt: new Date(now - 31 * 86400000).toISOString() }),
  ).toBe("unknown");
  expect(
    lifecycle({
      aiAssessment: {
        ...source.aiAssessment,
        evidenceUrl: "https://example.com/careers",
      },
    }),
  ).toBe("unknown");
});

it("never uses AI evidence past the application deadline", () => {
  expect(
    deriveJobLifecycle({
      sources: [aiSource],
      lastSeenAt: now,
      now,
      applicationDeadline: new Date(now - 1).toISOString(),
    }).status,
  ).toBe("expired");
});

it("does not let an inconclusive HTTP attempt extend AI display freshness", () => {
  expect(
    hasFreshJobActivity(
      {
        activityReason: "ai_open_server_unknown",
        aiActivityEvidenceAt: now - JOB_ACTIVITY_POLICY.aiEvidenceTtlMs - 1,
        lastVerifiedAt: now,
      },
      now,
    ),
  ).toBe(false);
  expect(
    hasFreshJobActivity(
      { activityReason: "ai_open_server_unknown", aiActivityEvidenceAt: now },
      now,
    ),
  ).toBe(true);
});

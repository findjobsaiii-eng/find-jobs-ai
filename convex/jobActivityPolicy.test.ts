import { describe, expect, it } from "vitest";
import {
  deriveJobLifecycle,
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

  it("backs temporary failures off to a bounded delay", () => {
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
    expect(retryDelayMs(99)).toBe(JOB_ACTIVITY_POLICY.maxRetryBackoffMs);
  });
});

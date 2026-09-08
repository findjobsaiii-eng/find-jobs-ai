export const JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS = 10 * 60 * 1_000;
export const JOB_SOURCE_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export type JobSearchPlan = "free" | "pro" | "admin";

// During the beta/pilot every account receives paid product capabilities.
// An explicit entitlement (including the development Free override) wins.
export const PILOT_DEFAULT_PLAN: JobSearchPlan = "pro";

export function resolveJobSearchPlan(
  entitlements: Array<{
    plan: JobSearchPlan;
    active: boolean;
    expiresAt?: number;
  }>,
  now: number,
): JobSearchPlan {
  return (
    entitlements.find(
      (item) =>
        item.active && (item.expiresAt === undefined || item.expiresAt > now),
    )?.plan ?? PILOT_DEFAULT_PLAN
  );
}

export function globalDayKey(now: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

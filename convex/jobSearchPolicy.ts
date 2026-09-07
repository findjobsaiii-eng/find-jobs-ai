export const JOB_SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS = 10 * 60 * 1_000;
export const JOB_SOURCE_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const CENTRAL_REUSE_MINIMUM_JOBS = 3;
export const JOB_RELEVANCE_THRESHOLD = 70;

export type JobSearchPlan = "free" | "pro" | "admin";

export type PlanPolicy = {
  quotaWindowMs: number;
  freshSearchesPerWindow: number;
  cooldownMs: number;
  maxQueriesPerSearch: number;
  maxAcceptedJobsPerSearch: number;
};

export const JOB_SEARCH_PLAN_POLICIES: Readonly<
  Record<JobSearchPlan, PlanPolicy>
> = {
  free: {
    quotaWindowMs: 7 * 24 * 60 * 60 * 1_000,
    freshSearchesPerWindow: 1,
    cooldownMs: 60 * 60 * 1_000,
    maxQueriesPerSearch: 1,
    maxAcceptedJobsPerSearch: 5,
  },
  pro: {
    quotaWindowMs: 24 * 60 * 60 * 1_000,
    freshSearchesPerWindow: 1,
    cooldownMs: 60 * 60 * 1_000,
    maxQueriesPerSearch: 2,
    maxAcceptedJobsPerSearch: 10,
  },
  admin: {
    quotaWindowMs: 60 * 60 * 1_000,
    freshSearchesPerWindow: 1,
    cooldownMs: 60 * 60 * 1_000,
    maxQueriesPerSearch: 2,
    maxAcceptedJobsPerSearch: 10,
  },
} as const;

export function quotaWindowIdentifier(
  plan: JobSearchPlan,
  windowStartedAt: number,
) {
  return `${plan}:${windowStartedAt}`;
}

export function globalDayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

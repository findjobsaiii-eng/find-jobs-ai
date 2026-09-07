export const JOB_SEARCH_ACTIVE_RUN_TIMEOUT_MS = 10 * 60 * 1_000;
export const JOB_SOURCE_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export type JobSearchPlan = "free" | "pro" | "admin";
export function globalDayKey(now: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

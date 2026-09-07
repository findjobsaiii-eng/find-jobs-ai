import { ConvexError } from "convex/values";
import { env } from "./_generated/server";

export type JobSearchRuntimeConfig = {
  enabled: boolean;
  globalDailyRunLimit: number;
  globalDailyQueryLimit: number;
  maxConcurrentRuns: number;
  outputTokenLimit: number;
};

function configurationError(variable: string): never {
  throw new ConvexError({ code: "JOB_SEARCH_CONFIGURATION_ERROR", variable });
}

function parseBoolean(name: string, value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return configurationError(name);
}

function parseBoundedInteger(
  name: string,
  value: string | undefined,
  maximum: number,
) {
  if (!value || !/^\d+$/u.test(value)) return configurationError(name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return configurationError(name);
  }
  return parsed;
}

export function parseJobSearchRuntimeConfig(values: {
  JOB_SEARCH_ENABLED?: string;
  JOB_SEARCH_GLOBAL_DAILY_RUN_LIMIT?: string;
  JOB_SEARCH_GLOBAL_DAILY_QUERY_LIMIT?: string;
  JOB_SEARCH_MAX_CONCURRENT_RUNS?: string;
  JOB_SEARCH_OUTPUT_TOKEN_LIMIT?: string;
}): JobSearchRuntimeConfig {
  return {
    enabled: parseBoolean("JOB_SEARCH_ENABLED", values.JOB_SEARCH_ENABLED),
    globalDailyRunLimit: parseBoundedInteger(
      "JOB_SEARCH_GLOBAL_DAILY_RUN_LIMIT",
      values.JOB_SEARCH_GLOBAL_DAILY_RUN_LIMIT,
      1_000,
    ),
    globalDailyQueryLimit: parseBoundedInteger(
      "JOB_SEARCH_GLOBAL_DAILY_QUERY_LIMIT",
      values.JOB_SEARCH_GLOBAL_DAILY_QUERY_LIMIT,
      2_000,
    ),
    maxConcurrentRuns: parseBoundedInteger(
      "JOB_SEARCH_MAX_CONCURRENT_RUNS",
      values.JOB_SEARCH_MAX_CONCURRENT_RUNS,
      20,
    ),
    outputTokenLimit: parseBoundedInteger(
      "JOB_SEARCH_OUTPUT_TOKEN_LIMIT",
      values.JOB_SEARCH_OUTPUT_TOKEN_LIMIT,
      6_000,
    ),
  };
}

export function getJobSearchRuntimeConfig() {
  return parseJobSearchRuntimeConfig(env);
}

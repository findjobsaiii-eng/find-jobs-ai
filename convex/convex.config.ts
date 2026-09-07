import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    AUTH_GOOGLE_ID: v.string(),
    AUTH_GOOGLE_SECRET: v.string(),
    JWKS: v.string(),
    JWT_PRIVATE_KEY: v.string(),
    OPENAI_API_KEY: v.string(),
    OPENAI_JOB_SEARCH_MODEL: v.string(),
    JOB_SEARCH_ENABLED: v.string(),
    JOB_SEARCH_GLOBAL_DAILY_RUN_LIMIT: v.string(),
    JOB_SEARCH_GLOBAL_DAILY_QUERY_LIMIT: v.string(),
    JOB_SEARCH_MAX_CONCURRENT_RUNS: v.string(),
    JOB_SEARCH_OUTPUT_TOKEN_LIMIT: v.string(),
    DEV_TOOLS_ENABLED: v.optional(v.string()),
    SITE_URL: v.string(),
  },
});

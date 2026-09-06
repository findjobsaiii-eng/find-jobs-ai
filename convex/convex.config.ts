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
    SITE_URL: v.string(),
  },
});
